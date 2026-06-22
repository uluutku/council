import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { aiConversationsQueryOptions } from '../../features/ai/queries/aiQueries.js';
import { useAiAccess } from '../../features/ai/hooks/useAiAccess.js';
import { AiAccessSummary } from '../../features/ai/components/AiAccessSummary.jsx';

// Responsive shell for the AI area, mirroring the messaging layout so the two can
// be merged later. On wide screens both panes show (assistants/conversations |
// active conversation); on narrow screens a single pane shows, driven by the
// data-view attribute and CSS.
export function AiLayout() {
  const { conversationId } = useParams();
  const { data: conversations = [] } = useQuery(aiConversationsQueryOptions());
  const { data: access } = useAiAccess();

  return (
    <div className="ai-layout" data-view={conversationId ? 'conversation' : 'list'}>
      <aside className="ai-sidebar" aria-label="AI assistants">
        <div className="ai-sidebar-header">
          <h1>AI</h1>
          <NavLink to="/app/ai" end className="button button--secondary button--small">
            Assistants
          </NavLink>
        </div>
        <AiAccessSummary access={access} variant="compact" />
        <nav className="ai-conversation-list" aria-label="Your AI conversations">
          {conversations.length === 0 ? (
            <p className="ai-sidebar-empty">No AI conversations yet.</p>
          ) : (
            <ul>
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <NavLink to={`/app/ai/${conversation.id}`} className="ai-conversation-link">
                    <span className="ai-conversation-name">{conversation.agent_name}</span>
                    <span className="ai-badge">AI</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </aside>
      <div className="ai-main">
        <Outlet />
      </div>
    </div>
  );
}
