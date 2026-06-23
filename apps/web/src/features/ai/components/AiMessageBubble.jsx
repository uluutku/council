import { AiImageAttachments } from './AiImageAttachments.jsx';
import { AiContextCard } from './AiContextCard.jsx';
import { AiDocumentAttachments } from './AiDocumentAttachments.jsx';
import { SafeMarkdown } from './SafeMarkdown.jsx';

export function AiMessageBubble({
  role,
  content,
  pending = false,
  streaming = false,
  contactName = 'Council Assistant',
  onRemember,
  conversationId,
  attachments = [],
  contextImport = null,
  documents = [],
  messageId,
  onSaveArtifact,
}) {
  const isAssistant = role === 'assistant';
  const showFooter =
    (!isAssistant && !pending && onRemember) ||
    (isAssistant && !streaming && messageId && onSaveArtifact);
  return (
    <li className="ai-message-row" data-role={role}>
      {isAssistant ? (
        <span className="ai-message-avatar" aria-hidden="true">
          AI
        </span>
      ) : null}
      <div className="ai-message-column">
        <div
          className="ai-message-bubble"
          data-role={role}
          data-pending={pending ? 'true' : undefined}
        >
          {isAssistant ? (
            <p className="ai-message-author">
              {contactName}
              <span className="ai-message-author-tag">AI</span>
            </p>
          ) : null}
          {!isAssistant ? <AiContextCard contextImport={contextImport} /> : null}
          {isAssistant ? (
            <div className="ai-message-text">
              <SafeMarkdown content={content} streaming={streaming} />
              {streaming ? <span className="ai-stream-caret" aria-hidden="true" /> : null}
            </div>
          ) : (
            <p className="ai-message-text">{content}</p>
          )}
          {!isAssistant ? (
            <>
              <AiImageAttachments conversationId={conversationId} attachments={attachments} />
              <AiDocumentAttachments conversationId={conversationId} documents={documents} />
            </>
          ) : null}
        </div>
        {showFooter ? (
          <div className="ai-message-footer">
            {!isAssistant && !pending && onRemember ? (
              <button type="button" className="ai-message-remember" onClick={onRemember}>
                Remember
              </button>
            ) : null}
            {isAssistant && !streaming && messageId && onSaveArtifact ? (
              <button type="button" className="ai-message-remember" onClick={onSaveArtifact}>
                Save as artifact
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
