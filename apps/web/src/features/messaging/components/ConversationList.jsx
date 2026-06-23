import { Link } from 'react-router-dom';
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
  presence = new Map(),
  onToggleMute = () => {},
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
    return (
      <div className="empty-state">
        <p className="empty-state-title">
          {emptyReason ?? 'You do not have any conversations yet.'}
        </p>
        {!emptyReason ? (
          <p>
            Open <Link to="/app/contacts">Contacts</Link> to message someone you have added.
          </p>
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
            onToggleMute={() => onToggleMute(conversation)}
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
