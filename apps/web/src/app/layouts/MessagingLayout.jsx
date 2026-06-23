import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthContext.js';
import { ConversationList } from '../../features/messaging/components/ConversationList.jsx';
import { useConversations } from '../../features/messaging/hooks/useConversations.js';
import { messagingErrorMessage } from '../../features/messaging/api/messagingErrorMessages.js';
import { setConversationMute } from '../../features/messaging/api/messagingApi.js';
import { usePresence } from '../../features/messaging/hooks/usePresence.js';
import { messagingKeys } from '../../lib/query-keys/messaging.js';
import { filterConversations } from '../../features/messaging/queries/conversationsQuery.js';

// Responsive shell for the messaging area. On wide screens both panes are
// visible (conversation list | active conversation). On narrow screens a single
// pane shows at a time: the list at /app/messages and the conversation at
// /app/messages/:conversationId, driven by the data-view attribute and CSS.
export function MessagingLayout() {
  const { conversationId } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');
  const {
    conversations,
    isPending,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useConversations();
  const presence = usePresence(conversations.map((conversation) => conversation.peer_id));
  const filtered = useMemo(
    () => filterConversations(conversations, filter),
    [conversations, filter],
  );
  const mute = useMutation({
    mutationFn: (conversation) =>
      setConversationMute({
        conversation_id: conversation.conversation_id,
        duration_seconds: null,
        forever: !conversation.is_muted,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: messagingKeys.conversations() }),
  });

  return (
    <div
      className="messaging-layout"
      data-view={conversationId || location.pathname.endsWith('/search') ? 'conversation' : 'list'}
    >
      <aside className="messaging-sidebar" aria-label="Conversations">
        <div className="messaging-sidebar-header">
          <h1>Messages</h1>
          <Link className="button button--secondary button--small" to="/app/messages/search">
            Search
          </Link>
        </div>
        <div className="inbox-filters" aria-label="Inbox filters">
          {[
            ['all', 'All', conversations.length],
            ['unread', 'Unread', conversations.filter((item) => item.unread_count > 0).length],
            ['muted', 'Muted', conversations.filter((item) => item.is_muted).length],
          ].map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              data-active={filter === value ? 'true' : undefined}
              onClick={() => setFilter(value)}
            >
              {label} {count > 0 ? <span>{count}</span> : null}
            </button>
          ))}
        </div>
        <ConversationList
          conversations={filtered}
          currentUserId={user?.id ?? null}
          selectedId={conversationId ?? null}
          isPending={isPending}
          isError={isError}
          error={isError ? messagingErrorMessage(error) : ''}
          onRetry={() => refetch()}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
          emptyReason={filter === 'all' ? null : `No ${filter} conversations match this filter.`}
          presence={presence}
          onToggleMute={(conversation) => mute.mutate(conversation)}
        />
      </aside>
      <div className="messaging-main">
        <Outlet />
      </div>
    </div>
  );
}
