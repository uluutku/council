import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithContacts } from '../test/renderWithContacts.jsx';
import { ContactsPage } from './ContactsPage.jsx';
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

const contact = {
  id: '22222222-2222-4222-8222-222222222222',
  username: 'bjorn',
  display_name: 'Bjorn',
  avatar_path: null,
  status_text: 'Exploring Council',
  relationship_id: '33333333-3333-4333-8333-333333333333',
  accepted_at: '2026-06-21T22:00:00+00:00',
};

beforeEach(() => {
  vi.clearAllMocks();
  contactsApi.listMyContactRequests.mockResolvedValue([]);
});

describe('ContactsPage', () => {
  it('renders accepted contacts', async () => {
    contactsApi.listMyContacts.mockResolvedValue([contact]);
    renderWithContacts(<ContactsPage />);

    expect(await screen.findByText('Bjorn')).toBeInTheDocument();
    expect(screen.getByText('@bjorn')).toBeInTheDocument();
    expect(screen.getByText('Exploring Council')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
  });

  it('shows an empty state with a path to discovery', async () => {
    contactsApi.listMyContacts.mockResolvedValue([]);
    renderWithContacts(<ContactsPage />);

    expect(await screen.findByText('You have no contacts yet.')).toBeInTheDocument();
    expect(
      screen.getByText('Search below and send a contact request to get started.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Contact requests' })).toBeInTheDocument();
  });

  it('confirms and removes a contact', async () => {
    const user = userEvent.setup();
    contactsApi.listMyContacts.mockResolvedValue([contact]);
    contactsApi.removeContact.mockResolvedValue({ removed: true });
    renderWithContacts(<ContactsPage />);

    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Remove Bjorn?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove contact' }));

    expect(await screen.findByText('Bjorn was removed from your contacts.')).toBeInTheDocument();
    expect(contactsApi.removeContact).toHaveBeenCalledWith(contact.id);
  });

  it('keeps the page and reports an error when removal fails', async () => {
    const user = userEvent.setup();
    contactsApi.listMyContacts.mockResolvedValue([contact]);
    contactsApi.removeContact.mockRejectedValue(new TypeError('Failed to fetch'));
    renderWithContacts(<ContactsPage />);

    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Remove contact' }));

    expect(await screen.findByText('Council cannot reach the server.')).toBeInTheDocument();
    expect(screen.getByText('Bjorn')).toBeInTheDocument();
  });

  it('confirms and blocks a contact', async () => {
    const user = userEvent.setup();
    contactsApi.listMyContacts.mockResolvedValue([contact]);
    contactsApi.blockUser.mockResolvedValue({ blocked: true });
    renderWithContacts(<ContactsPage />);

    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Block' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Block Bjorn?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Block user' }));

    expect(await screen.findByText('Bjorn is now blocked.')).toBeInTheDocument();
    expect(contactsApi.blockUser).toHaveBeenCalledWith(contact.id);
  });

  it('reports an error when blocking fails', async () => {
    const user = userEvent.setup();
    contactsApi.listMyContacts.mockResolvedValue([contact]);
    contactsApi.blockUser.mockRejectedValue({ status: 503, message: 'unavailable' });
    renderWithContacts(<ContactsPage />);

    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Block' }));
    await user.click(screen.getByRole('button', { name: 'Block user' }));

    expect(
      await screen.findByText('Council is temporarily unavailable. Try again.'),
    ).toBeInTheDocument();
  });

  it('returns focus to the invoking button after cancelling a dialog', async () => {
    const user = userEvent.setup();
    contactsApi.listMyContacts.mockResolvedValue([contact]);
    renderWithContacts(<ContactsPage />);

    await screen.findByText('Bjorn');
    const removeButton = screen.getByRole('button', { name: 'Remove' });
    await user.click(removeButton);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(removeButton).toHaveFocus());
  });
});
