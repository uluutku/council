import { describe, expect, it } from 'vitest';
import {
  blockUser,
  listMyBlockedUsers,
  listMyContactRequests,
  listMyContacts,
  removeContact,
  respondContactRequest,
  searchProfiles,
  sendContactRequest,
  unblockUser,
} from './contactsApi.js';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const REL = '33333333-3333-4333-8333-333333333333';
const TS = '2026-06-21T22:00:00+00:00';

function makeClient(response) {
  const calls = [];
  const result = {
    single: () => Promise.resolve(response),
    then: (resolve) => resolve(response),
  };
  return {
    calls,
    rpc(name, args) {
      calls.push({ name, args });
      return result;
    },
  };
}

function relationship(overrides = {}) {
  return {
    id: REL,
    user_low_id: ME < OTHER ? ME : OTHER,
    user_high_id: ME < OTHER ? OTHER : ME,
    requested_by: ME,
    status: 'pending',
    created_at: TS,
    responded_at: null,
    updated_at: TS,
    ...overrides,
  };
}

describe('searchProfiles', () => {
  it('calls the bounded search RPC with a validated query and limit', async () => {
    const client = makeClient({ data: [], error: null });
    await searchProfiles('bjorn', 20, client);
    expect(client.calls[0]).toEqual({
      name: 'search_profiles',
      args: { query: 'bjorn', result_limit: 20 },
    });
  });

  it('validates and returns search results', async () => {
    const client = makeClient({
      data: [
        {
          id: OTHER,
          username: 'bjorn',
          display_name: 'Bjorn',
          avatar_path: null,
          status_text: null,
          relationship_status: null,
        },
      ],
      error: null,
    });
    const results = await searchProfiles('bjorn', 20, client);
    expect(results).toHaveLength(1);
    expect(results[0].username).toBe('bjorn');
  });

  it('rejects a query shorter than two characters before calling the database', async () => {
    const client = makeClient({ data: [], error: null });
    await expect(searchProfiles('a', 20, client)).rejects.toBeInstanceOf(Error);
    expect(client.calls).toHaveLength(0);
  });

  it('rejects a result that leaks an email field', async () => {
    const client = makeClient({
      data: [
        {
          id: OTHER,
          username: 'bjorn',
          display_name: 'Bjorn',
          avatar_path: null,
          status_text: null,
          relationship_status: null,
          email: 'leak@example.test',
        },
      ],
      error: null,
    });
    await expect(searchProfiles('bjorn', 20, client)).rejects.toBeTruthy();
  });

  it('throws the raw database error so the caller can map it', async () => {
    const error = {
      code: '22023',
      message: 'profile search query must contain at least 2 characters',
    };
    const client = makeClient({ data: null, error });
    await expect(searchProfiles('bjorn', 20, client)).rejects.toBe(error);
  });
});

describe('sendContactRequest', () => {
  it('calls the RPC with the target user id and reports a sent request', async () => {
    const client = makeClient({
      data: relationship({ status: 'pending', requested_by: ME }),
      error: null,
    });
    const result = await sendContactRequest(OTHER, { actingUserId: ME }, client);
    expect(client.calls[0]).toEqual({
      name: 'send_contact_request',
      args: { target_user_id: OTHER },
    });
    expect(result.outcome).toBe('request_sent');
  });

  it('reports a reciprocal acceptance as now contacts', async () => {
    const client = makeClient({
      data: relationship({ status: 'accepted', requested_by: OTHER, responded_at: TS }),
      error: null,
    });
    const result = await sendContactRequest(OTHER, { actingUserId: ME }, client);
    expect(result.outcome).toBe('now_contacts');
  });

  it('reports an existing accepted relationship as already contacts', async () => {
    const client = makeClient({
      data: relationship({ status: 'accepted', requested_by: ME, responded_at: TS }),
      error: null,
    });
    const result = await sendContactRequest(OTHER, { actingUserId: ME }, client);
    expect(result.outcome).toBe('already_contacts');
  });

  it('honors a knownContact hint for an accepted relationship', async () => {
    const client = makeClient({
      data: relationship({ status: 'accepted', requested_by: OTHER, responded_at: TS }),
      error: null,
    });
    const result = await sendContactRequest(
      OTHER,
      { actingUserId: ME, knownContact: true },
      client,
    );
    expect(result.outcome).toBe('already_contacts');
  });
});

describe('respondContactRequest', () => {
  it('accepts a request through the RPC', async () => {
    const client = makeClient({
      data: relationship({ status: 'accepted', requested_by: OTHER, responded_at: TS }),
      error: null,
    });
    const row = await respondContactRequest(REL, 'accepted', client);
    expect(client.calls[0]).toEqual({
      name: 'respond_contact_request',
      args: { relationship_id: REL, response: 'accepted' },
    });
    expect(row.status).toBe('accepted');
  });
});

describe('boolean mutations', () => {
  it('removeContact reports idempotent success', async () => {
    const client = makeClient({ data: true, error: null });
    const result = await removeContact(OTHER, client);
    expect(client.calls[0]).toEqual({ name: 'remove_contact', args: { target_user_id: OTHER } });
    expect(result).toEqual({ removed: true });
  });

  it('blockUser reports success', async () => {
    const client = makeClient({ data: true, error: null });
    const result = await blockUser(OTHER, client);
    expect(client.calls[0]).toEqual({ name: 'block_user', args: { target_user_id: OTHER } });
    expect(result).toEqual({ blocked: true });
  });

  it('unblockUser reports success', async () => {
    const client = makeClient({ data: true, error: null });
    const result = await unblockUser(OTHER, client);
    expect(client.calls[0]).toEqual({ name: 'unblock_user', args: { target_user_id: OTHER } });
    expect(result).toEqual({ unblocked: true });
  });
});

describe('list wrappers', () => {
  it('listMyContacts validates and returns contacts', async () => {
    const client = makeClient({
      data: [
        {
          id: OTHER,
          username: 'bjorn',
          display_name: 'Bjorn',
          avatar_path: null,
          status_text: null,
          relationship_id: REL,
          accepted_at: TS,
        },
      ],
      error: null,
    });
    const contacts = await listMyContacts(client);
    expect(client.calls[0].name).toBe('list_my_contacts');
    expect(contacts[0].relationship_id).toBe(REL);
  });

  it('listMyContactRequests validates direction', async () => {
    const client = makeClient({
      data: [
        {
          relationship_id: REL,
          id: OTHER,
          username: 'bjorn',
          display_name: 'Bjorn',
          avatar_path: null,
          status_text: null,
          direction: 'incoming',
          created_at: TS,
        },
      ],
      error: null,
    });
    const requests = await listMyContactRequests(client);
    expect(requests[0].direction).toBe('incoming');
  });

  it('listMyContactRequests rejects an invalid response shape', async () => {
    const client = makeClient({
      data: [{ relationship_id: REL, id: OTHER, username: 'bjorn', direction: 'sideways' }],
      error: null,
    });
    await expect(listMyContactRequests(client)).rejects.toBeTruthy();
  });

  it('listMyBlockedUsers validates and returns blocked users', async () => {
    const client = makeClient({
      data: [
        {
          id: OTHER,
          username: 'bjorn',
          display_name: 'Bjorn',
          avatar_path: null,
          status_text: null,
          blocked_at: TS,
        },
      ],
      error: null,
    });
    const blocked = await listMyBlockedUsers(client);
    expect(client.calls[0].name).toBe('list_my_blocked_users');
    expect(blocked[0].id).toBe(OTHER);
  });

  it('list wrappers throw the raw error for mapping', async () => {
    const error = { code: 'PGRST301', message: 'jwt expired' };
    const client = makeClient({ data: null, error });
    await expect(listMyContacts(client)).rejects.toBe(error);
  });
});
