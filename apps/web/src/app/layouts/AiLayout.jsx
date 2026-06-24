import { Sparkles } from 'lucide-react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { aiConversationsQueryOptions } from '../../features/ai/queries/aiQueries.js';
import { useAiAccess } from '../../features/ai/hooks/useAiAccess.js';
import { AiAccessSummary } from '../../features/ai/components/AiAccessSummary.jsx';
import { IconButton } from '../../components/IconButton.jsx';
import { useCollectionPanelWidth } from './useCollectionPanelWidth.js';

// AI area shell. It reuses the shared MessengerShell collection-panel model so
// the AI side matches human messaging by construction: a resizable collection
// panel listing the user's AI conversations, then the active surface (the
// assistant catalogue at the index, or a conversation) in the content panel.
export function AiLayout() {
  const { conversationId } = useParams();
  const { data: conversations = [] } = useQuery(aiConversationsQueryOptions());
  const { data: access } = useAiAccess();
  const panel = useCollectionPanelWidth();

  return (
    <div
      className="messaging-layout ai-layout"
      data-view={conversationId ? 'conversation' : 'list'}
      style={{ '--collection-panel-width': `${panel.width}px` }}
    >
      <aside
        className="messaging-sidebar collection-panel"
        aria-label="AI contacts and conversations"
      >
        <div className="messaging-sidebar-header">
          <div>
            <h1>AI</h1>
            <p>Private assistants</p>
          </div>
          <div className="messaging-sidebar-actions">
            <IconButton
              as={NavLink}
              to="/app/contacts/ai"
              end
              icon={Sparkles}
              label="Browse assistants"
            />
          </div>
        </div>
        <AiAccessSummary access={access} variant="compact" />
        <nav className="conversation-list ai-conversation-list" aria-label="Your AI conversations">
          {conversations.length === 0 ? (
            <p className="collection-empty">
              No AI conversations yet. Open an assistant to start one.
            </p>
          ) : (
            conversations.map((conversation) => {
              const kind = conversation.kind === 'custom' ? 'custom' : 'ai';
              const name = conversation.display_name ?? 'Assistant';
              return (
                <div
                  key={conversation.id}
                  className="conversation-item"
                  data-selected={conversation.id === conversationId ? 'true' : undefined}
                >
                  <NavLink
                    to={`/app/messages/ai/${conversation.id}`}
                    state={{ displayName: name }}
                    className="conversation-item-link ai-conversation-link"
                  >
                    <span className="msg-avatar" data-kind={kind} aria-hidden="true">
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="conversation-item-body">
                      <span className="conversation-item-row">
                        <span className="conversation-item-name">{name}</span>
                        <span className="ai-badge" data-kind={kind}>
                          {kind === 'custom' ? 'Custom' : 'AI'}
                        </span>
                      </span>
                    </span>
                  </NavLink>
                </div>
              );
            })
          )}
        </nav>
      </aside>
      <div
        className="collection-panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize assistant list"
        aria-valuemin={panel.minWidth}
        aria-valuemax={panel.maxWidth}
        aria-valuenow={panel.width}
        tabIndex={0}
        onPointerDown={panel.startResize}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            panel.adjustWidth(-16);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            panel.adjustWidth(16);
          }
        }}
      />
      <div className="messaging-main content-panel ai-main">
        <Outlet />
      </div>
    </div>
  );
}
