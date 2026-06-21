import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithContacts } from '../test/renderWithContacts.jsx';
import { ContactsPage } from './ContactsPage.jsx';
import * as contactsApi from '../api/contactsApi.js';
import * as messagingApi from '../../messaging/api/messagingApi.js';

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

vi.mock('../../messaging/api/messagingApi.js', () => ({
  createOrGetDirectConversation: vi.fn(),
}));

const contact = {
  id: '22222222-2222-4222-8222-222222222222',
  username: 'bjorn',
  display_name: 'Bjorn',
  avatar_path: null,
  status_text: null,
  relationship_id: '33333333-3333-4333-8333-333333333333',
  accepted_at: '2026-06-21T22:00:00+00:00',
};

const conversationId = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  vi.clearAllMocks();
  contactsApi.listMyContactRequests.mockResolvedValue([]);
  contactsApi.listMyContacts.mockResolvedValue([contact]);
});

describe('ContactsPage messaging action', () => {
  it('opens a direct conversation and navigates to it', async () => {
    const user = userEvent.setup();
    messagingApi.createOrGetDirectConversation.mockResolvedValue({
      conversation_id: conversationId,
      conversation_type: 'direct',
      created_at: '2026-06-22T10:00:00+00:00',
      updated_at: '2026-06-22T10:00:00+00:00',
      can_send: true,
    });

    renderWithContacts(
      <Routes>
        <Route path="/" element={<ContactsPage />} />
        <Route path="/app/messages/:conversationId" element={<p>Conversation open</p>} />
      </Routes>,
    );

    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Message' }));

    expect(messagingApi.createOrGetDirectConversation).toHaveBeenCalledWith(contact.id);
    expect(await screen.findByText('Conversation open')).toBeInTheDocument();
  });

  it('shows a generic unavailable message when the conversation cannot be opened', async () => {
    const user = userEvent.setup();
    const error = new Error('conversation_unavailable');
    error.category = 'conversation_unavailable';
    error.name = 'MessagingApiError';
    messagingApi.createOrGetDirectConversation.mockRejectedValue(error);

    renderWithContacts(<ContactsPage />);

    await screen.findByText('Bjorn');
    await user.click(screen.getByRole('button', { name: 'Message' }));

    expect(
      await screen.findByText('Messaging is currently unavailable for this conversation.'),
    ).toBeInTheDocument();
  });
});
