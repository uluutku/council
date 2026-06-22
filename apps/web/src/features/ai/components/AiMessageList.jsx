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
                onRemember={
                  message.role === 'user' ? () => onRememberMessage?.(message) : undefined
                }
              />
            ))}
            {showPendingUser ? (
              <AiMessageBubble
                role="user"
                content={pendingUserMessage.content}
                pending
                contactName={contactName}
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
