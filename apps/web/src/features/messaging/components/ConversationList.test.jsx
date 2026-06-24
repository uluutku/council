import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConversationList } from './ConversationList.jsx';
import { makeConversation, ME_ID, PEER_ID } from '../test/fixtures.js';

function renderList(props) {
  return render(
    <MemoryRouter>
      <ConversationList
        conversations={[]}
        currentUserId={ME_ID}
        selectedId={null}
        isPending={false}
        isError={false}
        error=""
        onRetry={() => {}}
        hasNextPage={false}
        isFetchingNextPage={false}
        onLoadMore={() => {}}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('ConversationList', () => {
  it('shows an empty state with a path to Contacts', () => {
    renderList({ conversations: [] });
    expect(screen.getByText('You do not have any conversations yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contacts' })).toHaveAttribute('href', '/app/contacts');
  });

  it('renders a conversation with peer name and "Start the conversation" preview', () => {
    renderList({ conversations: [makeConversation()] });
    expect(screen.getByText('Bjorn')).toBeInTheDocument();
    expect(screen.getByText('Start the conversation')).toBeInTheDocument();
  });

  it('renders a deleted last-message preview without exposing content', () => {
    renderList({
      conversations: [
        makeConversation({
          last_message_id: 'aaaaaaaa-0000-4000-8000-000000000001',
          last_message_deleted: true,
          last_message_content: null,
          last_message_sender_id: PEER_ID,
          last_message_sequence: 4,
        }),
      ],
    });
    expect(screen.getByText('Message deleted')).toBeInTheDocument();
  });

  it('prefixes the preview with "You:" for the current user and shows the unread count', () => {
    renderList({
      conversations: [
        makeConversation({
          last_message_id: 'aaaaaaaa-0000-4000-8000-000000000002',
          last_message_content: 'see you soon',
          last_message_sender_id: ME_ID,
          last_message_sequence: 6,
          last_read_sequence: 3,
          last_delivered_sequence: 6,
          unread_count: 3,
        }),
      ],
    });
    expect(screen.getByText('You: see you soon')).toBeInTheDocument();
    expect(screen.getByLabelText('Conversation with Bjorn, 3 unread')).toBeInTheDocument();
  });

  it('marks the selected conversation with aria-current', () => {
    const conversation = makeConversation();
    renderList({ conversations: [conversation], selectedId: conversation.conversation_id });
    expect(screen.getByRole('link', { current: 'page' })).toBeInTheDocument();
  });

  it('renders an error with a retry action', async () => {
    const onRetry = vi.fn();
    renderList({ isError: true, error: 'Council is temporarily unavailable. Try again.', onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent('Council is temporarily unavailable.');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('offers a bounded load-more control', async () => {
    const onLoadMore = vi.fn();
    renderList({ conversations: [makeConversation()], hasNextPage: true, onLoadMore });
    await userEvent.click(screen.getByRole('button', { name: 'Load more conversations' }));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('opens card options without muting immediately', async () => {
    const user = userEvent.setup();
    const onToggleMute = vi.fn();
    const onDeleteChat = vi.fn();
    renderList({ conversations: [makeConversation()], onToggleMute, onDeleteChat });

    await user.click(screen.getByRole('button', { name: 'More options for Bjorn' }));

    expect(onToggleMute).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete chat/i })).toBeEnabled();

    await user.click(screen.getByRole('menuitem', { name: /mute chat/i }));
    expect(onToggleMute).toHaveBeenCalledWith(expect.objectContaining({ peer_id: PEER_ID }));

    await user.click(screen.getByRole('button', { name: 'More options for Bjorn' }));
    await user.click(screen.getByRole('menuitem', { name: /delete chat/i }));
    expect(onDeleteChat).toHaveBeenCalledWith(expect.objectContaining({ peer_id: PEER_ID }));
  });

  it('offers unmute, remove, and block actions from the card menu', async () => {
    const user = userEvent.setup();
    const onToggleMute = vi.fn();
    const onRemoveContact = vi.fn();
    const onBlockUser = vi.fn();
    renderList({
      conversations: [makeConversation({ is_muted: true })],
      onToggleMute,
      onRemoveContact,
      onBlockUser,
    });

    await user.click(screen.getByRole('button', { name: 'More options for Bjorn' }));
    await user.click(screen.getByRole('menuitem', { name: /unmute chat/i }));
    expect(onToggleMute).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'More options for Bjorn' }));
    await user.click(screen.getByRole('menuitem', { name: /remove contact/i }));
    expect(onRemoveContact).toHaveBeenCalledWith(expect.objectContaining({ peer_id: PEER_ID }));

    await user.click(screen.getByRole('button', { name: 'More options for Bjorn' }));
    await user.click(screen.getByRole('menuitem', { name: /block user/i }));
    expect(onBlockUser).toHaveBeenCalledWith(expect.objectContaining({ peer_id: PEER_ID }));
  });
});
