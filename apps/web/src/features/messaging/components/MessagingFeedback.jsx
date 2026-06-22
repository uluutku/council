// Shared loading, error, and skeleton helpers for the messaging surfaces.
// Loading is announced via role="status" and errors via role="alert"; errors
// never rely on colour alone and always offer a retry where recovery is
// possible.

export function MessagingLoading({ label }) {
  return (
    <p className="loading-state" role="status">
      {label}
    </p>
  );
}

export function MessagingError({ message, onRetry, retryLabel = 'Retry' }) {
  return (
    <div className="error-state" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="button button--secondary button--small" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function ConversationListSkeleton({ rows = 4 }) {
  return (
    <ul className="conversation-list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="conversation-item conversation-item--skeleton">
          <span className="msg-avatar msg-avatar--skeleton" />
          <span className="conversation-item-body">
            <span className="skeleton-line skeleton-line--short" />
            <span className="skeleton-line" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MessageListSkeleton({ rows = 6 }) {
  return (
    <div className="message-skeleton" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <span
          key={index}
          className="skeleton-bubble"
          data-mine={index % 3 === 0 ? 'true' : undefined}
        />
      ))}
    </div>
  );
}
