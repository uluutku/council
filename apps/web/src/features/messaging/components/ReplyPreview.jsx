// Renders a reference to the message being replied to. Used both inside the
// composer (with a cancel control) and inside a bubble (as a jump-to button).
// Content is always a short plain-text excerpt; a deleted target shows
// "Message deleted" and an unloaded target shows a safe unavailable state.
export function ReplyPreview({ reference, variant = 'bubble', onJump, onCancel }) {
  if (!reference) return null;

  const body = (
    <span className="reply-preview-body">
      <span className="reply-preview-author">{reference.authorLabel}</span>
      <span className="reply-preview-excerpt" data-muted={reference.muted ? 'true' : undefined}>
        {reference.excerpt}
      </span>
    </span>
  );

  if (variant === 'composer') {
    return (
      <div className="reply-preview reply-preview--composer">
        {body}
        {onCancel ? (
          <button
            type="button"
            className="reply-preview-cancel"
            onClick={onCancel}
            aria-label="Cancel reply"
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
    );
  }

  if (reference.canJump && onJump) {
    return (
      <button type="button" className="reply-preview reply-preview--jump" onClick={onJump}>
        {body}
      </button>
    );
  }

  return <div className="reply-preview">{body}</div>;
}
