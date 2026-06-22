// Keyboard-accessible action controls for a single message. Reply and react are
// only offered when sending is available; edit is offered for the sender's own
// active messages when available; delete is offered for the sender's own
// messages even when messaging is unavailable.
export function MessageActions({
  isOwn,
  canSend,
  isDeleted,
  reactionsOpen,
  onReply,
  onToggleReactions,
  onEdit,
  onDelete,
}) {
  const showReply = canSend && !isDeleted;
  const showReact = canSend && !isDeleted;
  const showEdit = isOwn && canSend && !isDeleted;
  const showDelete = isOwn && !isDeleted;

  if (!showReply && !showReact && !showEdit && !showDelete) return null;

  return (
    <div className="message-actions" role="group" aria-label="Message actions">
      {showReact ? (
        <button
          type="button"
          className="message-action"
          aria-expanded={reactionsOpen ? 'true' : 'false'}
          onClick={onToggleReactions}
        >
          React
        </button>
      ) : null}
      {showReply ? (
        <button type="button" className="message-action" onClick={onReply}>
          Reply
        </button>
      ) : null}
      {showEdit ? (
        <button type="button" className="message-action" onClick={onEdit}>
          Edit
        </button>
      ) : null}
      {showDelete ? (
        <button type="button" className="message-action message-action--danger" onClick={onDelete}>
          Delete
        </button>
      ) : null}
    </div>
  );
}
