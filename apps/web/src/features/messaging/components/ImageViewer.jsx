import { useEffect, useId, useRef } from 'react';
import { useAttachmentUrl } from '../hooks/useAttachmentUrl.js';
import { formatFileSize } from '../utils/attachments.js';

// A controlled image lightbox. It closes on Escape, restores focus to the
// thumbnail that opened it, keeps the image within the viewport, and never
// exposes a permanent public URL — the larger image loads through the same
// short-lived signed URL flow as the thumbnail.
export function ImageViewer({ attachment, onClose }) {
  const closeRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const { url, status } = useAttachmentUrl(attachment, { autoLoad: Boolean(attachment) });

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!attachment) return undefined;

    previousFocusRef.current = document.activeElement;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown, true);
      const previous = previousFocusRef.current;
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [attachment]);

  if (!attachment) return null;

  return (
    <div
      className="image-viewer-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="image-viewer-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="image-viewer-bar">
          <p id={titleId} className="image-viewer-title">
            {attachment.original_filename}
            <span className="image-viewer-size"> · {formatFileSize(attachment.size_bytes)}</span>
          </p>
          <button
            type="button"
            ref={closeRef}
            className="button button--secondary button--small"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="image-viewer-stage">
          {status === 'error' ? (
            <p className="image-viewer-message" role="alert">
              This image could not be loaded.
            </p>
          ) : url ? (
            <img className="image-viewer-image" src={url} alt={attachment.original_filename} />
          ) : (
            <p className="image-viewer-message">Loading…</p>
          )}
        </div>
      </div>
    </div>
  );
}
