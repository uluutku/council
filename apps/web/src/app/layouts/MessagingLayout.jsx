import { Bot, MoreHorizontal, Search, UserPlus } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthContext.js';
import { ConversationList } from '../../features/messaging/components/ConversationList.jsx';
import { AiConversationList } from '../../features/messaging/components/AiConversationList.jsx';
import { useConversations } from '../../features/messaging/hooks/useConversations.js';
import { messagingErrorMessage } from '../../features/messaging/api/messagingErrorMessages.js';
import {
  deleteConversationForMe,
  setConversationMute,
} from '../../features/messaging/api/messagingApi.js';
import { usePresence } from '../../features/messaging/hooks/usePresence.js';
import { conversationPeer, peerName } from '../../features/messaging/utils/peer.js';
import { messagingKeys } from '../../lib/query-keys/messaging.js';
import { aiKeys } from '../../lib/query-keys/ai.js';
import { filterConversations } from '../../features/messaging/queries/conversationsQuery.js';
import { IconButton } from '../../components/IconButton.jsx';
import { useCollectionPanelWidth } from './useCollectionPanelWidth.js';
import { aiConversationsQueryOptions } from '../../features/ai/queries/aiQueries.js';
import { deleteAiConversation } from '../../features/ai/api/aiApi.js';
import { aiErrorMessage } from '../../features/ai/api/aiErrorMessages.js';
import {
  useBlockUser,
  useRemoveContact,
} from '../../features/contacts/queries/contactMutations.js';
import { RemoveContactDialog } from '../../features/contacts/components/RemoveContactDialog.jsx';
import { BlockUserDialog } from '../../features/contacts/components/BlockUserDialog.jsx';
import { DeleteChatDialog } from '../../features/messaging/components/DeleteChatDialog.jsx';
import { mapContactError } from '../../features/contacts/utils/contactErrors.js';
import { FormStatus } from '../../components/FormStatus.jsx';

function conversationMatchesSearch(conversation, searchQuery) {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return true;
  return [
    conversation.peer_display_name,
    conversation.peer_username,
    conversation.peer_status_text,
    conversation.last_message_content,
  ].some((value) =>
    String(value ?? '')
      .toLowerCase()
      .includes(query),
  );
}

function aiConversationMatchesSearch(conversation, searchQuery) {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return true;
  return [conversation.display_name, conversation.description, conversation.kind].some((value) =>
    String(value ?? '')
      .toLowerCase()
      .includes(query),
  );
}

// Responsive shell for the messaging area. On wide screens both panes are
// visible (conversation list | active conversation). On narrow screens a single
// pane shows at a time: the list at /app/messages and the conversation at
// /app/messages/:conversationId, driven by the data-view attribute and CSS.
export function MessagingLayout() {
  const { conversationId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [conversationAction, setConversationAction] = useState(null);
  const [conversationStatus, setConversationStatus] = useState({ message: '', tone: 'neutral' });
  const panel = useCollectionPanelWidth();
  const isAiConversationRoute = location.pathname.includes('/app/messages/ai/');
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
  const { data: aiConversations = [], isPending: aiConversationsPending } = useQuery(
    aiConversationsQueryOptions(),
  );
  const presence = usePresence(conversations.map((conversation) => conversation.peer_id));
  const filteredByType = useMemo(
    () => filterConversations(conversations, filter),
    [conversations, filter],
  );
  const filtered = useMemo(
    () =>
      filteredByType.filter((conversation) => conversationMatchesSearch(conversation, searchQuery)),
    [filteredByType, searchQuery],
  );
  const unreadMessageCount = useMemo(
    () => conversations.reduce((total, item) => total + Math.max(0, item.unread_count ?? 0), 0),
    [conversations],
  );
  const filteredAi = useMemo(
    () =>
      filter === 'all'
        ? aiConversations.filter((conversation) =>
            aiConversationMatchesSearch(conversation, searchQuery),
          )
        : [],
    [aiConversations, filter, searchQuery],
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
  const removeContact = useRemoveContact();
  const blockUser = useBlockUser();
  const deleteHumanChat = useMutation({
    mutationFn: (conversation) => deleteConversationForMe(conversation.conversation_id),
    onSuccess: (_result, conversation) => {
      queryClient.invalidateQueries({ queryKey: messagingKeys.conversations() });
      queryClient.removeQueries({ queryKey: messagingKeys.messages(conversation.conversation_id) });
    },
  });
  const deleteAiChat = useMutation({
    mutationFn: (conversation) => deleteAiConversation(conversation.id),
    onSuccess: (_result, conversation) => {
      queryClient.invalidateQueries({ queryKey: aiKeys.conversations() });
      queryClient.removeQueries({ queryKey: aiKeys.messages(conversation.id) });
      queryClient.removeQueries({ queryKey: aiKeys.memorySettings(conversation.id) });
      queryClient.removeQueries({ queryKey: aiKeys.memories(conversation.id) });
    },
  });

  function closeConversationAction() {
    setConversationAction(null);
  }

  async function confirmRemoveContact() {
    const conversation = conversationAction?.conversation;
    if (!conversation) return;
    const name = peerName(conversationPeer(conversation));
    try {
      await removeContact.mutateAsync({ targetUserId: conversation.peer_id });
      await queryClient.invalidateQueries({ queryKey: messagingKeys.conversations() });
      setConversationStatus({
        message: `${name} was removed from your contacts.`,
        tone: 'success',
      });
    } catch (error) {
      setConversationStatus({ message: mapContactError(error).message, tone: 'error' });
    } finally {
      closeConversationAction();
    }
  }

  async function confirmDeleteChat() {
    const conversation = conversationAction?.conversation;
    if (!conversation) return;
    const kind = conversationAction.kind;
    const name =
      kind === 'ai'
        ? (conversation.display_name ?? 'Assistant')
        : peerName(conversationPeer(conversation));

    try {
      if (kind === 'ai') {
        await deleteAiChat.mutateAsync(conversation);
        setConversationStatus({ message: `Chat with ${name} was deleted.`, tone: 'success' });
        if (isAiConversationRoute && conversationId === conversation.id) {
          navigate('/app/messages', { replace: true });
        }
      } else {
        await deleteHumanChat.mutateAsync(conversation);
        setConversationStatus({ message: `Chat with ${name} was deleted.`, tone: 'success' });
        if (!isAiConversationRoute && conversationId === conversation.conversation_id) {
          navigate('/app/messages', { replace: true });
        }
      }
    } catch (error) {
      setConversationStatus({
        message: kind === 'ai' ? aiErrorMessage(error) : messagingErrorMessage(error),
        tone: 'error',
      });
    } finally {
      closeConversationAction();
    }
  }

  async function confirmBlockUser() {
    const conversation = conversationAction?.conversation;
    if (!conversation) return;
    const name = peerName(conversationPeer(conversation));
    try {
      await blockUser.mutateAsync({ targetUserId: conversation.peer_id });
      await queryClient.invalidateQueries({ queryKey: messagingKeys.conversations() });
      setConversationStatus({ message: `${name} is now blocked.`, tone: 'success' });
    } catch (error) {
      setConversationStatus({ message: mapContactError(error).message, tone: 'error' });
    } finally {
      closeConversationAction();
    }
  }

  return (
    <div
      className="messaging-layout"
      data-view={conversationId || location.pathname.endsWith('/search') ? 'conversation' : 'list'}
      style={{ '--collection-panel-width': `${panel.width}px` }}
    >
      <aside className="messaging-sidebar collection-panel" aria-label="Conversations">
        <div className="messaging-sidebar-header">
          <div>
            <h1>Messages</h1>
            <p>Human conversations</p>
          </div>
          <div className="messaging-sidebar-actions">
            <IconButton as={Link} to="/app/messages/search" icon={Search} label="Search messages" />
            <IconButton as={Link} to="/app/contacts" icon={UserPlus} label="Start a conversation" />
            <IconButton as={Link} to="/app/contacts/ai" icon={Bot} label="Browse AI contacts" />
            <IconButton icon={MoreHorizontal} label="More message options" disabled />
          </div>
        </div>
        <div className="inbox-filters" aria-label="Inbox filters">
          {[
            ['all', 'All', 0],
            ['unread', 'Unread', unreadMessageCount],
            ['muted', 'Muted', 0],
          ].map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              data-active={filter === value ? 'true' : undefined}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label} {count > 0 ? <span>{count}</span> : null}
            </button>
          ))}
        </div>
        <FormStatus message={conversationStatus.message} tone={conversationStatus.tone} />
        <label className="conversation-search">
          <Search aria-hidden="true" size={20} strokeWidth={2} />
          <span className="sr-only">Search conversations</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Search conversations..."
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <div className="conversation-scroll-area">
          <ConversationList
            conversations={filtered}
            currentUserId={user?.id ?? null}
            selectedId={isAiConversationRoute ? null : (conversationId ?? null)}
            isPending={isPending}
            isError={isError}
            error={isError ? messagingErrorMessage(error) : ''}
            onRetry={() => refetch()}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            renderEmpty={filteredAi.length === 0 && !aiConversationsPending}
            emptyReason={
              searchQuery.trim()
                ? 'No conversations match this search.'
                : filter === 'all'
                  ? null
                  : `No ${filter} conversations match this filter.`
            }
            presence={presence}
            onToggleMute={(conversation) => mute.mutate(conversation)}
            onDeleteChat={(conversation) => {
              setConversationStatus({ message: '', tone: 'neutral' });
              setConversationAction({ type: 'delete', kind: 'human', conversation });
            }}
            onRemoveContact={(conversation) => {
              setConversationStatus({ message: '', tone: 'neutral' });
              setConversationAction({ type: 'remove', kind: 'human', conversation });
            }}
            onBlockUser={(conversation) => {
              setConversationStatus({ message: '', tone: 'neutral' });
              setConversationAction({ type: 'block', kind: 'human', conversation });
            }}
          />
          <AiConversationList
            conversations={filteredAi}
            selectedId={isAiConversationRoute ? (conversationId ?? null) : null}
            onDeleteChat={(conversation) => {
              setConversationStatus({ message: '', tone: 'neutral' });
              setConversationAction({ type: 'delete', kind: 'ai', conversation });
            }}
          />
        </div>
      </aside>
      <div
        className="collection-panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize conversation list"
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
      <div className="messaging-main content-panel">
        <Outlet />
      </div>
      <RemoveContactDialog
        open={conversationAction?.type === 'remove'}
        name={conversationAction ? peerName(conversationPeer(conversationAction.conversation)) : ''}
        isPending={removeContact.isPending}
        onConfirm={confirmRemoveContact}
        onCancel={closeConversationAction}
      />
      <BlockUserDialog
        open={conversationAction?.type === 'block'}
        name={conversationAction ? peerName(conversationPeer(conversationAction.conversation)) : ''}
        isPending={blockUser.isPending}
        onConfirm={confirmBlockUser}
        onCancel={closeConversationAction}
      />
      <DeleteChatDialog
        open={conversationAction?.type === 'delete'}
        name={
          conversationAction?.kind === 'ai'
            ? (conversationAction.conversation.display_name ?? 'Assistant')
            : conversationAction
              ? peerName(conversationPeer(conversationAction.conversation))
              : ''
        }
        kind={conversationAction?.kind}
        isPending={deleteHumanChat.isPending || deleteAiChat.isPending}
        onConfirm={confirmDeleteChat}
        onCancel={closeConversationAction}
      />
    </div>
  );
}
