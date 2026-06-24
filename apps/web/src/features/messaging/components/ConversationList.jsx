import { Link } from 'react-router-dom';
import { ContactRound, MessagesSquare } from 'lucide-react';
import { ConversationListItem } from './ConversationListItem.jsx';
import {
  ConversationListSkeleton,
  MessagingError,
  MessagingLoading,
} from './MessagingFeedback.jsx';

// The inbox conversation list. Ordering always comes from the backend; this
// component only renders the flattened list, the bounded "load more" control,
// and the loading/empty/error states.
export function ConversationList({
  conversations,
  currentUserId,
  selectedId,
  isPending,
  isError,
  error,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  emptyReason = null,
  renderEmpty = true,
  presence = new Map(),
  onToggleMute = () => {},
  onDeleteChat = () => {},
  onRemoveContact = () => {},
  onBlockUser = () => {},
}) {
  if (isPending) {
    return (
      <>
        <MessagingLoading label="Loading your conversations…" />
        <ConversationListSkeleton />
      </>
    );
  }

  if (isError) {
    return <MessagingError message={error} onRetry={onRetry} />;
  }

  if (conversations.length === 0) {
    if (!renderEmpty) return null;
    return (
      <div className="empty-state empty-state--inbox">
        <span className="empty-state-icon" aria-hidden="true">
          <MessagesSquare size={28} strokeWidth={1.8} />
        </span>
        <p className="empty-state-title">{emptyReason ?? 'No conversations'}</p>
        {!emptyReason ? (
          <>
            <p>You do not have any conversations yet.</p>
            <p>
              Start a new one with your <Link to="/app/contacts">Contacts</Link> or an AI.
            </p>
          </>
        ) : null}
        {!emptyReason ? (
          <Link className="button empty-state-action" to="/app/contacts">
            <ContactRound aria-hidden="true" size={16} strokeWidth={2} />
            Open Contacts
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <nav aria-label="Conversations">
      <ul className="conversation-list">
        {conversations.map((conversation) => (
          <ConversationListItem
            key={conversation.conversation_id}
            conversation={conversation}
            currentUserId={currentUserId}
            isSelected={conversation.conversation_id === selectedId}
            presence={presence.get(conversation.peer_id) ?? null}
            onMuteToggle={() => onToggleMute(conversation)}
            onDeleteChat={() => onDeleteChat(conversation)}
            onRemoveContact={() => onRemoveContact(conversation)}
            onBlockUser={() => onBlockUser(conversation)}
          />
        ))}
      </ul>
      {hasNextPage ? (
        <div className="conversation-load-more">
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more conversations'}
          </button>
        </div>
      ) : null}
    </nav>
  );
}
