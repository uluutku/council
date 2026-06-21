import { describe, expect, it, vi } from 'vitest';
import {
  addMessageReaction,
  createOrGetDirectConversation,
  deleteMessage,
  editMessage,
  listConversationMessages,
  listMyConversations,
  markConversationDelivered,
  markConversationRead,
  removeMessageReaction,
  sendMessage,
} from './messagingApi.js';

const CONVERSATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLIENT_MESSAGE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';
const TIMESTAMP = '2026-06-22T12:00:00+00:00';

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

function message(overrides = {}) {
  return {
    id: MESSAGE,
    conversation_id: CONVERSATION,
    sequence: 1,
    sender_user_id: USER,
    content: 'Hello',
    reply_to_message_id: null,
    created_at: TIMESTAMP,
    edited_at: null,
    deleted_at: null,
    reactions: [],
    ...overrides,
  };
}

function conversation(overrides = {}) {
  return {
    conversation_id: CONVERSATION,
    conversation_type: 'direct',
    peer_id: PEER,
    peer_username: 'peer_user',
    peer_display_name: 'Peer User',
    peer_avatar_path: null,
    peer_status_text: null,
    last_message_id: MESSAGE,
    last_message_content: 'Hello',
    last_message_deleted: false,
    last_message_sender_id: USER,
    last_message_sequence: 1,
    last_message_at: TIMESTAMP,
    last_read_sequence: 0,
    last_delivered_sequence: 0,
    unread_count: 1,
    can_send: true,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

describe('conversation RPC wrappers', () => {
  it('creates or retrieves a direct conversation using only the target id', async () => {
    const client = makeClient({
      data: {
        conversation_id: CONVERSATION,
        conversation_type: 'direct',
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
        can_send: true,
      },
      error: null,
    });

    const result = await createOrGetDirectConversation(PEER, client);
    expect(client.calls[0]).toEqual({
      name: 'create_or_get_direct_conversation',
      args: { target_user_id: PEER },
    });
    expect(result.conversation_id).toBe(CONVERSATION);
  });

  it('lists conversations with the stable paired cursor arguments', async () => {
    const client = makeClient({ data: [conversation()], error: null });
    const result = await listMyConversations(
      {
        result_limit: 10,
        cursor_updated_at: TIMESTAMP,
        cursor_id: CONVERSATION,
      },
      client,
    );

    expect(client.calls[0]).toEqual({
      name: 'list_my_conversations',
      args: {
        result_limit: 10,
        cursor_updated_at: TIMESTAMP,
        cursor_id: CONVERSATION,
      },
    });
    expect(result).toHaveLength(1);
  });

  it('rejects conversation responses containing private fields', async () => {
    const client = makeClient({
      data: [conversation({ email: 'private@example.test' })],
      error: null,
    });

    await expect(listMyConversations({}, client)).rejects.toBeTruthy();
  });
});

describe('message RPC wrappers', () => {
  it('lists a bounded message page with p-prefixed SQL arguments', async () => {
    const client = makeClient({ data: [message()], error: null });
    const result = await listConversationMessages(
      {
        conversation_id: CONVERSATION,
        before_sequence: 20,
        result_limit: 25,
      },
      client,
    );

    expect(client.calls[0]).toEqual({
      name: 'list_conversation_messages',
      args: {
        p_conversation_id: CONVERSATION,
        p_before_sequence: 20,
        p_result_limit: 25,
      },
    });
    expect(result[0].sequence).toBe(1);
  });

  it('sends normalized content with an idempotency key', async () => {
    const client = makeClient({ data: message(), error: null });
    await sendMessage(
      {
        conversation_id: CONVERSATION,
        client_message_id: CLIENT_MESSAGE,
        content: '  Hello  ',
        reply_to_message_id: null,
      },
      client,
    );

    expect(client.calls[0]).toEqual({
      name: 'send_message',
      args: {
        p_conversation_id: CONVERSATION,
        p_client_message_id: CLIENT_MESSAGE,
        p_content: 'Hello',
        p_reply_to_message_id: null,
      },
    });
  });

  it('edits through the sender-only RPC', async () => {
    const client = makeClient({ data: message({ content: 'Edited' }), error: null });
    const result = await editMessage({ message_id: MESSAGE, content: ' Edited ' }, client);

    expect(client.calls[0]).toEqual({
      name: 'edit_message',
      args: { p_message_id: MESSAGE, p_content: 'Edited' },
    });
    expect(result.content).toBe('Edited');
  });

  it('requires delete responses to be content-free tombstones', async () => {
    const client = makeClient({
      data: message({ content: null, deleted_at: TIMESTAMP }),
      error: null,
    });
    const result = await deleteMessage(MESSAGE, client);

    expect(client.calls[0]).toEqual({
      name: 'delete_message',
      args: { p_message_id: MESSAGE },
    });
    expect(result.content).toBeNull();
  });

  it('rejects a malformed deleted response that leaks content', async () => {
    const client = makeClient({
      data: message({ content: 'leaked', deleted_at: TIMESTAMP }),
      error: null,
    });

    await expect(deleteMessage(MESSAGE, client)).rejects.toBeTruthy();
  });

  it('rejects invalid message responses', async () => {
    const client = makeClient({
      data: message({ sequence: 0 }),
      error: null,
    });

    await expect(
      sendMessage(
        {
          conversation_id: CONVERSATION,
          client_message_id: CLIENT_MESSAGE,
          content: 'Hello',
        },
        client,
      ),
    ).rejects.toBeTruthy();
  });
});

describe('reaction and receipt wrappers', () => {
  it('adds and removes only the caller reaction through RPCs', async () => {
    const addClient = makeClient({
      data: {
        message_id: MESSAGE,
        user_id: USER,
        emoji: '👍',
        created_at: TIMESTAMP,
      },
      error: null,
    });
    const removeClient = makeClient({ data: true, error: null });

    await addMessageReaction({ message_id: MESSAGE, emoji: ' 👍 ' }, addClient);
    const removed = await removeMessageReaction({ message_id: MESSAGE, emoji: '👍' }, removeClient);

    expect(addClient.calls[0]).toEqual({
      name: 'add_message_reaction',
      args: { p_message_id: MESSAGE, p_emoji: '👍' },
    });
    expect(removeClient.calls[0]).toEqual({
      name: 'remove_message_reaction',
      args: { p_message_id: MESSAGE, p_emoji: '👍' },
    });
    expect(removed).toEqual({ removed: true });
  });

  it.each([
    ['markConversationDelivered', markConversationDelivered, 'mark_conversation_delivered'],
    ['markConversationRead', markConversationRead, 'mark_conversation_read'],
  ])('calls %s with the validated receipt shape', async (_label, wrapper, rpcName) => {
    const client = makeClient({
      data: {
        conversation_id: CONVERSATION,
        last_delivered_sequence: 4,
        last_read_sequence: rpcName === 'mark_conversation_read' ? 4 : 3,
      },
      error: null,
    });

    const result = await wrapper({ conversation_id: CONVERSATION, through_sequence: 4 }, client);

    expect(client.calls[0]).toEqual({
      name: rpcName,
      args: {
        p_conversation_id: CONVERSATION,
        p_through_sequence: 4,
      },
    });
    expect(result.last_delivered_sequence).toBe(4);
  });
});

describe('safe failure behavior', () => {
  it('throws a stable application error while retaining the raw error as its cause', async () => {
    const error = { code: 'P0001', message: 'messaging_unavailable' };
    const client = makeClient({ data: null, error });

    const rejection = await listMyConversations({}, client).catch((caught) => caught);
    expect(rejection.category).toBe('messaging_unavailable');
    expect(rejection.message).toBe('messaging_unavailable');
    expect(rejection.cause).toBe(error);
  });

  it('does not log message content when an RPC fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = makeClient({
      data: null,
      error: { code: 'P0001', message: 'messaging_unavailable' },
    });

    await expect(
      sendMessage(
        {
          conversation_id: CONVERSATION,
          client_message_id: CLIENT_MESSAGE,
          content: 'private message body',
        },
        client,
      ),
    ).rejects.toBeTruthy();

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
