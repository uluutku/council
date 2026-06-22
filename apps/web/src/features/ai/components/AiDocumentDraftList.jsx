import { documentTypeLabel, humanFileSize } from '../utils/aiDocuments.js';

export function AiDocumentDraftList({ drafts, onRemove, onRetry }) {
  if (!drafts.length) return null;
  return (
    <ul className="ai-document-list" aria-label="Documents ready to send">
      {drafts.map((draft) => (
        <li key={draft.draftId} className="ai-document-card">
          <div>
            <strong>{draft.filename}</strong>
            <span>
              {documentTypeLabel(draft.mimeType)} · {humanFileSize(draft.sizeBytes)}
            </span>
            <span>{draft.status === 'ready' ? 'Ready' : draft.status}</span>
          </div>
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
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
