// Shared loading, error, and empty presentational helpers. Loading is announced
// through role="status" and errors through role="alert" so assistive technology
// hears state changes; errors never rely on colour alone.
export function ContactsLoading({ label }) {
  return (
    <p className="loading-state" role="status">
      {label}
    </p>
  );
}

export function ContactsError({ message, onRetry }) {
  return (
    <div className="error-state" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="button button--secondary button--small" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {children}
    </div>
  );
}
