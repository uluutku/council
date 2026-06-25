import { tokenizeMessageContent } from '../utils/messageContent.js';
import { OptimisticAttachments } from './MessageAttachments.jsx';

// Renders an optimistic outgoing message that has not yet been confirmed by the
// backend. A pending item announces "Sending" politely; a failed item stays
// visible with accessible retry and remove controls and never claims to be
// delivered or read. Local image previews are shown until the authoritative row
// arrives.
export function OptimisticMessage({ item, onRetry, onRemove }) {
  const failed = item.status === 'failed';
  const queued = item.status === 'queued';
  const tokens = tokenizeMessageContent(item.content);

  return (
    <li className="message-row" data-own="true">
      <p className="message-meta">
        {failed ? (
          <span className="message-receipt" data-status="failed" role="alert">
            Not sent
          </span>
        ) : queued ? (
          <span className="message-receipt" data-status="queued" role="status">
            Queued
          </span>
        ) : (
          <span className="message-receipt" data-status="sending" role="status">
            Sending...
          </span>
        )}
      </p>
      <div className="message-bubble" data-own="true" data-status={item.status}>
        <OptimisticAttachments attachments={item.attachments} />
        {item.content ? (
          <p className="message-text">
            {tokens.map((token, index) =>
              token.type === 'link' ? (
                <a key={index} href={token.href} target="_blank" rel="noopener noreferrer">
                  {token.value}
                </a>
              ) : (
                <span key={index}>{token.value}</span>
              ),
            )}
          </p>
        ) : null}
        {failed || queued ? (
          <div
            className="message-actions"
            role="group"
            aria-label={queued ? 'Queued message actions' : 'Failed message actions'}
          >
            <button
              type="button"
              className="message-action"
              onClick={() => onRetry(item.clientMessageId)}
            >
              {queued ? 'Send now' : 'Retry'}
            </button>
            <button
              type="button"
              className="message-action message-action--danger"
              onClick={() => onRemove(item.clientMessageId)}
            >
              Remove
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
