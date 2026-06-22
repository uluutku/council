import { isImageMimeType } from '@council/schemas';
import { useAttachmentUrl } from '../hooks/useAttachmentUrl.js';
import { attachmentTypeLabel, formatFileSize } from '../utils/attachments.js';

// Renders an authoritative message's attachments: bounded image thumbnails that
// open a viewer, and file cards with Open/Download actions. Signed URLs are
// resolved on demand and never persisted. Filenames are rendered as text only.

function AttachmentImage({ attachment, onOpen }) {
  const { url, status } = useAttachmentUrl(attachment, { autoLoad: true });
  const aspectRatio =
    attachment.width && attachment.height
      ? `${attachment.width} / ${attachment.height}`
      : undefined;

  return (
    <button
      type="button"
      className="attachment-image"
      style={{ aspectRatio }}
      onClick={() => onOpen(attachment)}
      aria-label={`Open image ${attachment.original_filename}`}
    >
      {status === 'error' ? (
        <span className="attachment-image-fallback" role="alert">
          Image unavailable
        </span>
      ) : url ? (
        <img src={url} alt={attachment.original_filename} loading="lazy" />
      ) : (
        <span className="attachment-image-placeholder" aria-hidden="true" />
      )}
    </button>
  );
}

function AttachmentFileCard({ attachment }) {
  const { resolve: resolveView } = useAttachmentUrl(attachment);
  const { resolve: resolveDownload } = useAttachmentUrl(attachment, { download: true });

  async function open(resolver) {
    const url = await resolver();
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="attachment-file">
      <span className="attachment-file-icon" aria-hidden="true">
        {attachmentTypeLabel(attachment.mime_type, attachment.original_filename)}
      </span>
      <span className="attachment-file-meta">
        <span className="attachment-file-name">{attachment.original_filename}</span>
        <span className="attachment-file-size">
          {attachmentTypeLabel(attachment.mime_type, attachment.original_filename)} ·{' '}
          {formatFileSize(attachment.size_bytes)}
        </span>
      </span>
      <span className="attachment-file-actions">
        <button
          type="button"
          className="button button--secondary button--small"
          onClick={() => open(resolveView)}
        >
          Open
        </button>
        <button
          type="button"
          className="button button--secondary button--small"
          onClick={() => open(resolveDownload)}
        >
          Download
        </button>
      </span>
    </div>
  );
}

export function MessageAttachments({ attachments, onOpenImage }) {
  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((attachment) => isImageMimeType(attachment.mime_type));
  const files = attachments.filter((attachment) => !isImageMimeType(attachment.mime_type));

  return (
    <div className="message-attachments">
      {images.length > 0 ? (
        <div className="message-attachments-images" data-count={images.length}>
          {images.map((attachment) => (
            <AttachmentImage key={attachment.id} attachment={attachment} onOpen={onOpenImage} />
          ))}
        </div>
      ) : null}
      {files.map((attachment) => (
        <AttachmentFileCard key={attachment.id} attachment={attachment} />
      ))}
    </div>
  );
}

// Lightweight previews for an optimistic (sending) message. They reuse the local
// object URLs created in the composer so no signed URL is requested before the
// message exists.
export function OptimisticAttachments({ attachments }) {
  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((attachment) => attachment.isImage);
  const files = attachments.filter((attachment) => !attachment.isImage);

  return (
    <div className="message-attachments" data-optimistic="true">
      {images.length > 0 ? (
        <div className="message-attachments-images" data-count={images.length}>
          {images.map((attachment) => (
            <span key={attachment.id} className="attachment-image attachment-image--static">
              {attachment.previewUrl ? (
                <img src={attachment.previewUrl} alt={attachment.filename} />
              ) : (
                <span className="attachment-image-placeholder" aria-hidden="true" />
              )}
            </span>
          ))}
        </div>
      ) : null}
      {files.map((attachment) => (
        <div key={attachment.id} className="attachment-file">
          <span className="attachment-file-icon" aria-hidden="true">
            {attachmentTypeLabel(attachment.mimeType, attachment.filename)}
          </span>
          <span className="attachment-file-meta">
            <span className="attachment-file-name">{attachment.filename}</span>
            <span className="attachment-file-size">{formatFileSize(attachment.sizeBytes)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
