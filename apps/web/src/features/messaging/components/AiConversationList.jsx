import { Bot, Sparkles } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { ConversationOptionsMenu } from './ConversationOptionsMenu.jsx';
import { formatConversationTimestamp, formatFullTimestamp } from '../utils/datetime.js';

function aiDescription(conversation) {
  return conversation.description?.trim() || 'Online';
}

export function AiConversationList({ conversations, selectedId, onDeleteChat = () => {} }) {
  if (conversations.length === 0) return null;

  return (
    <nav className="conversation-section" aria-label="AI conversations">
      <div className="conversation-section-header">
        <span>AI chats</span>
        <Link to="/app/contacts/ai" aria-label="Browse AI contacts">
          <Sparkles aria-hidden="true" size={14} strokeWidth={2} />
        </Link>
      </div>
      <ul className="conversation-list conversation-list--ai">
        {conversations.map((conversation) => {
          const name = conversation.display_name ?? 'Assistant';
          const timestamp = conversation.last_message_at ?? conversation.updated_at;
          const kind = conversation.kind === 'custom' ? 'custom' : 'ai';
          return (
            <li
              key={conversation.id}
              className="conversation-item"
              data-selected={conversation.id === selectedId ? 'true' : undefined}
            >
              <div className="conversation-item-shell">
                <NavLink
                  to={`/app/messages/ai/${conversation.id}`}
                  state={{ displayName: name }}
                  className="conversation-item-link ai-conversation-link"
                  aria-current={conversation.id === selectedId ? 'page' : undefined}
                  aria-label={`AI conversation with ${name}`}
                >
                  <span className="msg-avatar" data-kind={kind} aria-hidden="true">
                    <Bot size={20} strokeWidth={2} />
                  </span>
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
                      <span className="conversation-item-preview">
                        {aiDescription(conversation)}
                      </span>
                      <span className="ai-badge" data-kind={kind}>
                        {kind === 'custom' ? 'Custom' : 'AI'}
                      </span>
                    </span>
                    <span className="conversation-item-meta">Online</span>
                  </span>
                </NavLink>
                <ConversationOptionsMenu
                  name={name}
                  items={[
                    {
                      key: 'delete',
                      label: 'Delete chat',
                      description: 'Remove this AI history',
                      tone: 'danger',
                      onSelect: () => onDeleteChat(conversation),
                    },
                  ]}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
