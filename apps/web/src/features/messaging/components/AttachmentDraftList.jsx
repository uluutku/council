import { attachmentTypeLabel, formatFileSize } from '../utils/attachments.js';

const STATUS_LABEL = {
  uploading: 'Uploading…',
  ready: 'Ready',
  failed: 'Upload failed',
};

// The composer's pending-attachment tray. Each draft shows a preview (image
// thumbnail or file chip), its upload status, a remove control, and a retry
// control when an upload fails.
export function AttachmentDraftList({ drafts, onRemove, onRetry }) {
  if (!drafts || drafts.length === 0) return null;

  return (
    <ul className="attachment-drafts" aria-label="Pending attachments">
      {drafts.map((draft) => (
        <li key={draft.draftId} className="attachment-draft" data-status={draft.status}>
          <div className="attachment-draft-preview" aria-hidden="true">
            {draft.isImage && draft.previewUrl ? (
              <img src={draft.previewUrl} alt="" />
            ) : (
              <span className="attachment-draft-icon">
                {attachmentTypeLabel(draft.mimeType, draft.filename)}
              </span>
            )}
          </div>
          <div className="attachment-draft-meta">
            <span className="attachment-draft-name">{draft.filename}</span>
            <span className="attachment-draft-status" data-status={draft.status}>
              {STATUS_LABEL[draft.status] ?? ''} · {formatFileSize(draft.sizeBytes)}
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
