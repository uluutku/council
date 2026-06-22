// A single AI conversation message rendered as plain text (no Markdown, no raw
// HTML). White-space is preserved so multi-line answers read naturally.
export function AiMessageBubble({
  role,
  content,
  pending = false,
  streaming = false,
  contactName = 'Council Assistant',
  onRemember,
}) {
  const isAssistant = role === 'assistant';
  return (
    <li className="ai-message-row" data-role={role}>
      <div
        className="ai-message-bubble"
        data-role={role}
        data-pending={pending ? 'true' : undefined}
      >
        {isAssistant ? <p className="ai-message-author">{contactName} · AI</p> : null}
        <p className="ai-message-text">
          {content}
          {streaming ? <span className="ai-stream-caret" aria-hidden="true" /> : null}
        </p>
        {!isAssistant && !pending && onRemember ? (
          <button type="button" className="ai-message-remember" onClick={onRemember}>
            Remember
          </button>
        ) : null}
      </div>
    </li>
  );
}
