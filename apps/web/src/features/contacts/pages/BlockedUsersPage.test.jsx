import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithContacts } from '../test/renderWithContacts.jsx';
import { BlockedUsersPage } from './BlockedUsersPage.jsx';
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

const blockedUser = {
  id: '22222222-2222-4222-8222-222222222222',
  username: 'bjorn',
  display_name: 'Bjorn',
  avatar_path: null,
  status_text: null,
  blocked_at: '2026-06-21T22:00:00+00:00',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BlockedUsersPage', () => {
  it('renders blocked users', async () => {
    contactsApi.listMyBlockedUsers.mockResolvedValue([blockedUser]);
    renderWithContacts(<BlockedUsersPage />);

    expect(await screen.findByText('Bjorn')).toBeInTheDocument();
    expect(screen.getByText('@bjorn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unblock' })).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    contactsApi.listMyBlockedUsers.mockResolvedValue([]);
    renderWithContacts(<BlockedUsersPage />);

    expect(await screen.findByText('You have not blocked anyone.')).toBeInTheDocument();
  });

  it('explains the relationship is not restored and unblocks on confirmation', async () => {
    const user = userEvent.setup();
    contactsApi.listMyBlockedUsers.mockResolvedValue([blockedUser]);
    contactsApi.unblockUser.mockResolvedValue({ unblocked: true });
    renderWithContacts(<BlockedUsersPage />);

    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Unblock' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/does not restore/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Unblock' }));

    expect(await screen.findByText('Bjorn has been unblocked.')).toBeInTheDocument();
    expect(contactsApi.unblockUser).toHaveBeenCalledWith(blockedUser.id);
  });

  it('reports an error when unblocking fails', async () => {
    const user = userEvent.setup();
    contactsApi.listMyBlockedUsers.mockResolvedValue([blockedUser]);
    contactsApi.unblockUser.mockRejectedValue(new TypeError('Failed to fetch'));
    renderWithContacts(<BlockedUsersPage />);

    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Unblock' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Unblock' }));

    expect(await screen.findByText('Council cannot reach the server.')).toBeInTheDocument();
  });
});
