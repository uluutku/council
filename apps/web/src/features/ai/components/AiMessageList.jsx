import { useEffect, useRef } from 'react';
import { AiMessageBubble } from './AiMessageBubble.jsx';
import { AiStarterPrompts } from './AiStarterPrompts.jsx';

// Renders the persisted history plus the in-flight exchange. The streaming
// assistant text is not itself an aria-live region (that would read every
// token); a separate status region announces the generation state instead.
export function AiMessageList({
  messages,
  pendingUserMessage,
  assistantText,
  isStreaming,
  isLoading,
  onSelectStarter,
  composerDisabled,
  contactName,
  onRememberMessage,
  hasOlderMessages,
  isLoadingOlder,
  onLoadOlder,
  onSaveArtifact,
}) {
  const scrollRef = useRef(null);

  const showPendingUser =
    pendingUserMessage &&
    !messages.some(
      (message) =>
        message.role === 'user' &&
        message.client_message_id === pendingUserMessage.client_message_id,
    );

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, assistantText, isStreaming]);

  if (isLoading) {
    return (
      <div className="ai-message-region">
        <p className="ai-message-loading">Loading conversation…</p>
      </div>
    );
  }

  const isEmpty = messages.length === 0 && !showPendingUser && !isStreaming;

  return (
    <div className="ai-message-region">
      <p className="sr-only" role="status" aria-live="polite">
        {isStreaming ? 'Council Assistant is generating a response.' : ''}
      </p>
      <div className="ai-message-scroll" ref={scrollRef}>
        {hasOlderMessages ? (
          <button
            type="button"
            className="button button--secondary button--small ai-load-older"
            onClick={onLoadOlder}
            disabled={isLoadingOlder}
          >
            {isLoadingOlder ? 'Loading…' : 'Load older messages'}
          </button>
        ) : null}
        {isEmpty ? (
          <div className="ai-empty-state">
            <p className="ai-empty-title">Start a conversation with Council Assistant.</p>
            <p className="ai-empty-note">
              Council Assistant is an AI. It can be wrong — check anything important.
            </p>
            <AiStarterPrompts onSelect={onSelectStarter} disabled={composerDisabled} />
          </div>
        ) : (
          <ol className="ai-message-list" aria-label="AI conversation">
            {messages.map((message) => (
              <AiMessageBubble
                key={message.id}
                role={message.role}
                content={message.content}
                contactName={contactName}
                conversationId={message.conversation_id}
                attachments={message.attachments}
                documents={message.documents}
                contextImport={message.context_import}
                onRemember={
                  message.role === 'user' ? () => onRememberMessage?.(message) : undefined
                }
                messageId={message.id}
                onSaveArtifact={
                  message.role === 'assistant' ? () => onSaveArtifact?.(message) : undefined
                }
              />
            ))}
            {showPendingUser ? (
              <AiMessageBubble
                role="user"
                content={pendingUserMessage.content}
                pending
                contactName={contactName}
                conversationId={pendingUserMessage.conversation_id}
                attachments={pendingUserMessage.attachments}
                documents={pendingUserMessage.documents}
                contextImport={pendingUserMessage.context_import}
              />
            ) : null}
            {isStreaming ? (
              <AiMessageBubble
                role="assistant"
                content={assistantText}
                streaming
                contactName={contactName}
              />
            ) : null}
          </ol>
        )}
      </div>
    </div>
  );
}
