import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithContacts } from '../test/renderWithContacts.jsx';
import { ContactRequestsPage } from './ContactRequestsPage.jsx';
import * as contactsApi from '../api/contactsApi.js';

vi.mock('../api/contactsApi.js', () => ({
  listMyContacts: vi.fn(),
  listMyContactRequests: vi.fn(),
  listMyBlockedUsers: vi.fn(),
  searchProfiles: vi.fn(),
  sendContactRequest: vi.fn(),
  respondContactRequest: vi.fn(),
  removeContact: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
}));

const TS = '2026-06-21T22:00:00+00:00';

const incoming = {
  relationship_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  id: '22222222-2222-4222-8222-222222222222',
  username: 'bjorn',
  display_name: 'Bjorn',
  avatar_path: null,
  status_text: null,
  direction: 'incoming',
  created_at: TS,
};

const outgoing = {
  relationship_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  id: '44444444-4444-4444-8444-444444444444',
  username: 'cosima',
  display_name: 'Cosima',
  avatar_path: null,
  status_text: null,
  direction: 'outgoing',
  created_at: TS,
};

function acceptedRelationship() {
  return {
    id: incoming.relationship_id,
    user_low_id: '11111111-1111-4111-8111-111111111111',
    user_high_id: incoming.id,
    requested_by: incoming.id,
    status: 'accepted',
    created_at: TS,
    responded_at: TS,
    updated_at: TS,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ContactRequestsPage', () => {
  it('renders incoming and outgoing sections', async () => {
    contactsApi.listMyContactRequests.mockResolvedValue([incoming, outgoing]);
    renderWithContacts(<ContactRequestsPage />);

    const incomingSection = await screen.findByRole('region', { name: 'Incoming' });
    expect(within(incomingSection).getByText('Bjorn')).toBeInTheDocument();
    const outgoingSection = screen.getByRole('region', { name: 'Outgoing' });
    expect(within(outgoingSection).getByText('Cosima')).toBeInTheDocument();
    expect(within(outgoingSection).getByText('Request sent')).toBeInTheDocument();
  });

  it('accepts an incoming request', async () => {
    const user = userEvent.setup();
    contactsApi.listMyContactRequests.mockResolvedValue([incoming]);
    contactsApi.respondContactRequest.mockResolvedValue(acceptedRelationship());
    renderWithContacts(<ContactRequestsPage />);

    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(await screen.findByText('You are now contacts with Bjorn.')).toBeInTheDocument();
    expect(contactsApi.respondContactRequest).toHaveBeenCalledWith(
      incoming.relationship_id,
      'accepted',
    );
  });

  it('rejects an incoming request after confirmation', async () => {
    const user = userEvent.setup();
    contactsApi.listMyContactRequests.mockResolvedValue([incoming]);
    contactsApi.respondContactRequest.mockResolvedValue({
      ...acceptedRelationship(),
      status: 'rejected',
    });
    renderWithContacts(<ContactRequestsPage />);

    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Reject' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Reject Bjorn?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Reject request' }));

    expect(await screen.findByText('You declined the request from Bjorn.')).toBeInTheDocument();
    expect(contactsApi.respondContactRequest).toHaveBeenCalledWith(
      incoming.relationship_id,
      'rejected',
    );
  });

  it('blocks an incoming requester after confirmation', async () => {
    const user = userEvent.setup();
    contactsApi.listMyContactRequests.mockResolvedValue([incoming]);
    contactsApi.blockUser.mockResolvedValue({ blocked: true });
    renderWithContacts(<ContactRequestsPage />);

    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Block' }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Block user' }));

    expect(await screen.findByText('Bjorn is now blocked.')).toBeInTheDocument();
    expect(contactsApi.blockUser).toHaveBeenCalledWith(incoming.id);
  });

  it('reports a stale request safely', async () => {
    const user = userEvent.setup();
    contactsApi.listMyContactRequests.mockResolvedValue([incoming]);
    contactsApi.respondContactRequest.mockRejectedValue({
      code: '22023',
      message: 'only pending contact requests can be answered',
    });
    renderWithContacts(<ContactRequestsPage />);

    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(
      await screen.findByText('This request is no longer available. Refresh and try again.'),
    ).toBeInTheDocument();
  });

  it('shows an empty incoming state', async () => {
    contactsApi.listMyContactRequests.mockResolvedValue([outgoing]);
    renderWithContacts(<ContactRequestsPage />);

    expect(await screen.findByText('No incoming requests.')).toBeInTheDocument();
  });

  it('shows an empty outgoing state', async () => {
    contactsApi.listMyContactRequests.mockResolvedValue([incoming]);
    renderWithContacts(<ContactRequestsPage />);

    expect(await screen.findByText('No outgoing requests.')).toBeInTheDocument();
  });
});
