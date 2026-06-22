import { formatFullTimestamp } from '../../messaging/utils/datetime.js';

export function AiContextCard({ contextImport }) {
  if (!contextImport) return null;

  return (
    <details className="ai-context-card">
      <summary>
        Forwarded context · {contextImport.message_count}{' '}
        {contextImport.message_count === 1 ? 'message' : 'messages'}
      </summary>
      <div className="ai-context-card-body">
        <p className="ai-context-card-note">
          This is the text snapshot confirmed when it was forwarded. Later source edits or deletion
          do not change this copy.
        </p>
        <ol className="ai-context-items">
          {contextImport.items.map((item) => (
            <li key={item.id} className="ai-context-item">
              <p className="ai-context-item-meta">
                <strong>{item.source_sender_label}</strong>
                {' · '}
                <time dateTime={item.source_created_at}>
                  {formatFullTimestamp(item.source_created_at)}
                </time>
              </p>
              <p className="ai-context-item-text">{item.copied_content}</p>
              {item.attachments_excluded ? (
                <p className="ai-context-exclusion">Attachment excluded</p>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
