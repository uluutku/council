import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithContacts } from '../test/renderWithContacts.jsx';
import { DiscoverContactsPage } from './DiscoverContactsPage.jsx';
import * as contactsApi from '../api/contactsApi.js';

vi.mock('../api/contactsApi.js', () => ({
  listMyContacts: vi.fn(),
  listMyContactRequests: vi.fn().mockResolvedValue([]),
  listMyBlockedUsers: vi.fn(),
  searchProfiles: vi.fn(),
  sendContactRequest: vi.fn(),
  respondContactRequest: vi.fn(),
  removeContact: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
}));

function result(overrides = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    username: 'bjorn',
    display_name: 'Bjorn',
    avatar_path: null,
    status_text: 'Hello',
    relationship_status: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  contactsApi.listMyContactRequests.mockResolvedValue([]);
});

describe('DiscoverContactsPage', () => {
  it('does not query for a single character', async () => {
    const user = userEvent.setup();
    contactsApi.searchProfiles.mockResolvedValue([]);
    renderWithContacts(<DiscoverContactsPage />);

    await user.type(screen.getByLabelText('Search people'), 'a');
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(contactsApi.searchProfiles).not.toHaveBeenCalled();
    expect(screen.getByText('Type at least two characters to search.')).toBeInTheDocument();
  });

  it('debounces and runs a single search', async () => {
    const user = userEvent.setup();
    contactsApi.searchProfiles.mockResolvedValue([result()]);
    renderWithContacts(<DiscoverContactsPage />);

    await user.type(screen.getByLabelText('Search people'), 'bjorn');

    expect(await screen.findByText('Bjorn')).toBeInTheDocument();
    expect(contactsApi.searchProfiles).toHaveBeenCalledTimes(1);
    expect(contactsApi.searchProfiles).toHaveBeenCalledWith('bjorn');
  });

  it('shows an empty result state', async () => {
    const user = userEvent.setup();
    contactsApi.searchProfiles.mockResolvedValue([]);
    renderWithContacts(<DiscoverContactsPage />);

    await user.type(screen.getByLabelText('Search people'), 'zzz');
    expect(await screen.findByText('No people matched that search.')).toBeInTheDocument();
  });

  it('shows a loading state while searching', async () => {
    const user = userEvent.setup();
    contactsApi.searchProfiles.mockReturnValue(new Promise(() => {}));
    renderWithContacts(<DiscoverContactsPage />);

    await user.type(screen.getByLabelText('Search people'), 'bjorn');
    expect(await screen.findByText('Searching…')).toBeInTheDocument();
  });

  it('shows an error with a retry that re-runs the search and preserves the query', async () => {
    const user = userEvent.setup();
    contactsApi.searchProfiles
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce([result()]);
    renderWithContacts(<DiscoverContactsPage />);

    await user.type(screen.getByLabelText('Search people'), 'bjorn');
    expect(await screen.findByText('Council cannot reach the server.')).toBeInTheDocument();
    expect(screen.getByLabelText('Search people')).toHaveValue('bjorn');

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Bjorn')).toBeInTheDocument();
  });

  it('sends a contact request and reports it', async () => {
    const user = userEvent.setup();
    contactsApi.searchProfiles.mockResolvedValue([result()]);
    contactsApi.sendContactRequest.mockResolvedValue({
      outcome: 'request_sent',
      relationship: {
        id: '33333333-3333-4333-8333-333333333333',
        user_low_id: '11111111-1111-4111-8111-111111111111',
        user_high_id: '22222222-2222-4222-8222-222222222222',
        requested_by: '11111111-1111-4111-8111-111111111111',
        status: 'pending',
        created_at: '2026-06-21T22:00:00+00:00',
        responded_at: null,
        updated_at: '2026-06-21T22:00:00+00:00',
      },
    });
    renderWithContacts(<DiscoverContactsPage />);

    await user.type(screen.getByLabelText('Search people'), 'bjorn');
    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Add contact' }));

    expect(await screen.findByText('Contact request sent to Bjorn.')).toBeInTheDocument();
    expect(contactsApi.sendContactRequest).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      {
        actingUserId: 'me-0000-0000-0000-000000000000',
        knownContact: false,
      },
    );
  });

  it('reports a reciprocal acceptance', async () => {
    const user = userEvent.setup();
    contactsApi.searchProfiles.mockResolvedValue([result()]);
    contactsApi.sendContactRequest.mockResolvedValue({
      outcome: 'now_contacts',
      relationship: {
        id: '33333333-3333-4333-8333-333333333333',
        user_low_id: '11111111-1111-4111-8111-111111111111',
        user_high_id: '22222222-2222-4222-8222-222222222222',
        requested_by: '22222222-2222-4222-8222-222222222222',
        status: 'accepted',
        created_at: '2026-06-21T22:00:00+00:00',
        responded_at: '2026-06-21T22:00:00+00:00',
        updated_at: '2026-06-21T22:00:00+00:00',
      },
    });
    renderWithContacts(<DiscoverContactsPage />);

    await user.type(screen.getByLabelText('Search people'), 'bjorn');
    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Add contact' }));

    expect(await screen.findByText('You are now contacts with Bjorn.')).toBeInTheDocument();
  });

  it('renders an already-contacts result without an add button', async () => {
    const user = userEvent.setup();
    contactsApi.searchProfiles.mockResolvedValue([result({ relationship_status: 'accepted' })]);
    renderWithContacts(<DiscoverContactsPage />);

    await user.type(screen.getByLabelText('Search people'), 'bjorn');
    expect(await screen.findByText('Already contacts')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add contact' })).not.toBeInTheDocument();
  });

  it('shows a generic unavailable message when a request is blocked', async () => {
    const user = userEvent.setup();
    contactsApi.searchProfiles.mockResolvedValue([result()]);
    contactsApi.sendContactRequest.mockRejectedValue({
      code: '42501',
      message: 'contact request is not allowed',
    });
    renderWithContacts(<DiscoverContactsPage />);

    await user.type(screen.getByLabelText('Search people'), 'bjorn');
    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Add contact' }));

    expect(await screen.findByText('This person is not available right now.')).toBeInTheDocument();
  });

  it('does not let a stale slow search replace a newer result', async () => {
    const user = userEvent.setup();
    const resolvers = {};
    contactsApi.searchProfiles.mockImplementation(
      (query) =>
        new Promise((resolve) => {
          resolvers[query] = resolve;
        }),
    );
    renderWithContacts(<DiscoverContactsPage />);

    const input = screen.getByLabelText('Search people');
    await user.type(input, 'bo');
    await waitFor(() => expect(contactsApi.searchProfiles).toHaveBeenCalledWith('bo'));

    await user.type(input, 's');
    await waitFor(() => expect(contactsApi.searchProfiles).toHaveBeenCalledWith('bos'));

    // The newer query resolves first, then the stale one resolves late.
    resolvers.bos([
      result({
        id: '44444444-4444-4444-8444-444444444444',
        username: 'bosun',
        display_name: 'Bosun',
      }),
    ]);
    expect(await screen.findByText('Bosun')).toBeInTheDocument();

    resolvers.bo([result({ username: 'bjorn', display_name: 'Bjorn' })]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByText('Bosun')).toBeInTheDocument();
    expect(screen.queryByText('Bjorn')).not.toBeInTheDocument();
  });
});
