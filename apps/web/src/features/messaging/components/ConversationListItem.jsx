import { Link } from 'react-router-dom';
import { PeerAvatar } from './PeerAvatar.jsx';
import { conversationPeer, peerName } from '../utils/peer.js';
import { previewExcerpt } from '../utils/messageContent.js';
import { formatConversationTimestamp, formatFullTimestamp } from '../utils/datetime.js';

function previewText(conversation, currentUserId) {
  if (!conversation.last_message_id) {
    return { text: 'Start the conversation', muted: true };
  }
  if (conversation.last_message_deleted) {
    return { text: 'Message deleted', muted: true };
  }

  const excerpt = previewExcerpt(conversation.last_message_content ?? '');
  const mine = conversation.last_message_sender_id === currentUserId;
  return { text: mine ? `You: ${excerpt}` : excerpt, muted: false };
}

export function ConversationListItem({ conversation, currentUserId, isSelected }) {
  const peer = conversationPeer(conversation);
  const name = peerName(peer);
  const preview = previewText(conversation, currentUserId);
  const unread = conversation.unread_count ?? 0;
  const timestamp = conversation.last_message_at;

  return (
    <li className="conversation-item" data-selected={isSelected ? 'true' : undefined}>
      <Link
        to={`/app/messages/${conversation.conversation_id}`}
        state={{ peer }}
        className="conversation-item-link"
        aria-current={isSelected ? 'page' : undefined}
        aria-label={`Conversation with ${name}${unread > 0 ? `, ${unread} unread` : ''}`}
      >
        <PeerAvatar peer={peer} />
        <span className="conversation-item-body">
          <span className="conversation-item-row">
            <span className="conversation-item-name">{name}</span>
            {timestamp ? (
              <time
                className="conversation-item-time"
                dateTime={timestamp}
                title={formatFullTimestamp(timestamp)}
              >
                {formatConversationTimestamp(timestamp)}
              </time>
            ) : null}
          </span>
          <span className="conversation-item-row">
            <span
              className="conversation-item-preview"
              data-muted={preview.muted ? 'true' : undefined}
            >
              {preview.text}
            </span>
            {unread > 0 ? (
              <span className="conversation-unread" aria-hidden="true">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </span>
          {!conversation.can_send ? (
            <span className="conversation-item-meta">Messaging unavailable</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
