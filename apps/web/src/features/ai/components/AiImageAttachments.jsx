import { useState } from 'react';
import { useAiImageUrl } from '../hooks/useAiImageUrl.js';

function Thumbnail({ conversationId, attachment, onOpen }) {
  const { url, status } = useAiImageUrl(conversationId, attachment);
  const source = attachment.preview_url ?? url;
  return (
    <button
      type="button"
      className="attachment-image"
      style={{ aspectRatio: `${attachment.width} / ${attachment.height}` }}
      onClick={() => onOpen(attachment)}
      aria-label={`Open image ${attachment.original_filename}`}
    >
      {status === 'error' && !source ? (
        <span className="attachment-image-fallback" role="alert">
          Image unavailable
        </span>
      ) : source ? (
        <img src={source} alt={attachment.original_filename} />
      ) : (
        <span className="attachment-image-placeholder" aria-hidden="true" />
      )}
    </button>
  );
}

function Viewer({ conversationId, attachment, onClose }) {
  const { url, status } = useAiImageUrl(conversationId, attachment);
  const source = attachment.preview_url ?? url;
  return (
    <div
      className="image-viewer-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="image-viewer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={attachment.original_filename}
      >
        <div className="image-viewer-bar">
          <p className="image-viewer-title">{attachment.original_filename}</p>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="image-viewer-stage">
          {status === 'error' && !source ? (
            <p className="image-viewer-message" role="alert">
              This image could not be loaded.
            </p>
          ) : source ? (
            <img className="image-viewer-image" src={source} alt={attachment.original_filename} />
          ) : (
            <p className="image-viewer-message">Loading…</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function AiImageAttachments({ conversationId, attachments }) {
  const [open, setOpen] = useState(null);
  if (!attachments?.length) return null;
  return (
    <>
      <div className="message-attachments-images" data-count={attachments.length}>
        {attachments.map((attachment) => (
          <Thumbnail
            key={attachment.id}
            conversationId={conversationId}
            attachment={attachment}
            onOpen={setOpen}
          />
        ))}
      </div>
      {open ? (
        <Viewer conversationId={conversationId} attachment={open} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}
