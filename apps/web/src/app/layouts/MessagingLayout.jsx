import { Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../providers/AuthContext.js';
import { ConversationList } from '../../features/messaging/components/ConversationList.jsx';
import { useConversations } from '../../features/messaging/hooks/useConversations.js';
import { messagingErrorMessage } from '../../features/messaging/api/messagingErrorMessages.js';

// Responsive shell for the messaging area. On wide screens both panes are
// visible (conversation list | active conversation). On narrow screens a single
// pane shows at a time: the list at /app/messages and the conversation at
// /app/messages/:conversationId, driven by the data-view attribute and CSS.
export function MessagingLayout() {
  const { conversationId } = useParams();
  const { user } = useAuth();
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

  return (
    <div className="messaging-layout" data-view={conversationId ? 'conversation' : 'list'}>
      <aside className="messaging-sidebar" aria-label="Conversations">
        <div className="messaging-sidebar-header">
          <h1>Messages</h1>
        </div>
        <ConversationList
          conversations={conversations}
          currentUserId={user?.id ?? null}
          selectedId={conversationId ?? null}
          isPending={isPending}
          isError={isError}
          error={isError ? messagingErrorMessage(error) : ''}
          onRetry={() => refetch()}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
        />
      </aside>
      <div className="messaging-main">
        <Outlet />
      </div>
    </div>
  );
}
