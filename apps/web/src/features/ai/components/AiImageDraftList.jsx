export function AiImageDraftList({ drafts, onRemove, onRetry }) {
  if (!drafts.length) return null;
  return (
    <ul className="attachment-drafts" aria-label="Selected AI images">
      {drafts.map((draft) => (
        <li key={draft.draftId} className="attachment-draft" data-status={draft.status}>
          <div className="attachment-draft-preview">
            <img src={draft.previewUrl} alt={draft.filename} />
          </div>
          <div className="attachment-draft-meta">
            <span className="attachment-draft-name">{draft.filename}</span>
            <span className="attachment-draft-status">
              {draft.status === 'uploading'
                ? 'Preparing…'
                : draft.status === 'ready'
                  ? 'Ready'
                  : 'Upload failed'}
            </span>
          </div>
          <div className="attachment-draft-actions">
            {draft.status === 'failed' ? (
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => onRetry(draft.draftId)}
              >
                Retry
              </button>
            ) : null}
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => onRemove(draft.draftId)}
              aria-label={`Remove ${draft.filename}`}
            >
              Remove
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
