import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { useAuth } from '../../../app/providers/AuthContext.js';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { ConfirmDialog } from '../../contacts/components/ConfirmDialog.jsx';
import { ConversationHeader } from '../components/ConversationHeader.jsx';
import { MessageList } from '../components/MessageList.jsx';
import { MessageComposer } from '../components/MessageComposer.jsx';
import { MessagingUnavailableBanner } from '../components/MessagingUnavailableBanner.jsx';
import { MessagingError } from '../components/MessagingFeedback.jsx';
import { useConversationSummary } from '../hooks/useConversationSummary.js';
import { useConversationMessages } from '../hooks/useConversationMessages.js';
import { useConversationRealtime } from '../hooks/useConversationRealtime.js';
import { useSendMessage } from '../hooks/useSendMessage.js';
import { useMessageMutations } from '../hooks/useMessageMutations.js';
import { useConversationReceipts } from '../hooks/useConversationReceipts.js';
import { conversationPeer, peerName } from '../utils/peer.js';
import { highestLoadedSequence } from '../utils/messageList.js';
import { previewExcerpt } from '../utils/messageContent.js';
import { mergePeerReceipt } from '../utils/receipts.js';
import { isConversationAccessError, messagingErrorMessage } from '../api/messagingErrorMessages.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function UnavailableConversation() {
  return (
    <section className="conversation-page conversation-page--blocked">
      <ConversationHeader peer={null} realtimeStatus="subscribed" />
      <div className="empty-state empty-state--conversation">
        <p className="empty-state-title">This conversation is unavailable.</p>
      </div>
    </section>
  );
}

export function ConversationPage() {
  const { conversationId } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const isValidId = typeof conversationId === 'string' && UUID_PATTERN.test(conversationId);

  const { summary } = useConversationSummary(isValidId ? conversationId : null);
  const messagesState = useConversationMessages(isValidId ? conversationId : null);
  const mutations = useMessageMutations(conversationId);
  const sender = useSendMessage(conversationId);

  const [peerReceipt, setPeerReceipt] = useState({ readSequence: 0, deliveredSequence: 0 });
  const [replyTarget, setReplyTarget] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editError, setEditError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionError, setActionError] = useState('');

  const handlePeerReceipt = useCallback((receipt) => {
    setPeerReceipt((current) => mergePeerReceipt(current, receipt));
  }, []);

  const { status: realtimeStatus } = useConversationRealtime({
    conversationId: isValidId ? conversationId : null,
    currentUserId,
    onPeerReceipt: handlePeerReceipt,
  });

  const messages = messagesState.messages;
  const targetSequence = useMemo(() => highestLoadedSequence(messages), [messages]);

  useConversationReceipts({
    conversationId: isValidId ? conversationId : null,
    targetSequence,
    isActive: true,
  });

  // Prefer the inbox summary's peer; fall back to peer passed via navigation so
  // the header renders immediately when arriving from Contacts or the inbox.
  const peer = useMemo(
    () => conversationPeer(summary) ?? location.state?.peer ?? null,
    [summary, location.state],
  );
  const name = peer ? peerName(peer) : 'Conversation';
  usePageTitle(name === 'Conversation' ? 'Messages' : name);

  // can_send is known from the summary, or optimistically from navigation state.
  const resolvedCanSend = summary ? summary.can_send : (location.state?.canSend ?? null);
  const canSend = resolvedCanSend !== false;
  const showUnavailable = resolvedCanSend === false;

  // If messaging becomes unavailable mid-edit, the edit form is suppressed by
  // derivation (no synchronous state update in an effect). The unavailable
  // banner is the generic explanation; saving is blocked because canSend gates
  // the edit controls.
  const activeEditingId = canSend ? editingMessageId : null;

  // Place focus sensibly on the conversation when it opens.
  useEffect(() => {
    if (!isValidId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector('.conversation-header-name')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversationId, isValidId]);

  const replyReferenceForComposer = useMemo(() => {
    if (!replyTarget) return null;
    const isOwn = replyTarget.sender_user_id === currentUserId;
    return {
      authorLabel: isOwn ? 'You' : name,
      excerpt:
        replyTarget.deleted_at !== null
          ? 'Message deleted'
          : previewExcerpt(replyTarget.content ?? '', 80),
      muted: replyTarget.deleted_at !== null,
    };
  }, [replyTarget, currentUserId, name]);

  const handleSend = useCallback(
    (content) => {
      const clientMessageId = sender.send(content, replyTarget?.id ?? null);
      if (clientMessageId) setReplyTarget(null);
      return clientMessageId;
    },
    [sender, replyTarget],
  );

  const handleSaveEdit = useCallback(
    async (message, content) => {
      setEditError('');
      try {
        await mutations.edit.mutateAsync({ messageId: message.id, content });
        setEditingMessageId(null);
      } catch (error) {
        setEditError(messagingErrorMessage(error));
      }
    },
    [mutations.edit],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setActionError('');
    try {
      await mutations.remove.mutateAsync({ messageId: deleteTarget.id });
    } catch (error) {
      setActionError(messagingErrorMessage(error));
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, mutations.remove]);

  const handleToggleReaction = useCallback(
    (message, emoji, reactedByMe) => {
      setActionError('');
      const mutation = reactedByMe ? mutations.removeReaction : mutations.addReaction;
      mutation.mutate(
        { messageId: message.id, emoji },
        { onError: (error) => setActionError(messagingErrorMessage(error)) },
      );
    },
    [mutations.addReaction, mutations.removeReaction],
  );

  if (!isValidId) {
    return <UnavailableConversation />;
  }

  // A membership/access failure must look identical to a missing conversation.
  if (messagesState.isError && isConversationAccessError(messagesState.error)) {
    return <UnavailableConversation />;
  }

  return (
    <section className="conversation-page" aria-label={`Conversation with ${name}`}>
      <ConversationHeader peer={peer} realtimeStatus={realtimeStatus} />

      {showUnavailable ? <MessagingUnavailableBanner /> : null}
      <FormStatus message={actionError} tone="error" />

      {messagesState.isError && !isConversationAccessError(messagesState.error) ? (
        <MessagingError
          message={messagingErrorMessage(messagesState.error)}
          onRetry={() => messagesState.refetch()}
        />
      ) : (
        <MessageList
          messages={messages}
          outgoing={sender.outgoing}
          currentUserId={currentUserId}
          peer={peer}
          canSend={canSend}
          peerReceipt={peerReceipt}
          isInitialLoading={messagesState.isPending}
          hasOlder={messagesState.hasOlder}
          isFetchingOlder={messagesState.isFetchingOlder}
          onLoadOlder={messagesState.fetchOlder}
          editingMessageId={activeEditingId}
          editState={{ isSaving: mutations.edit.isPending, errorMessage: editError }}
          onReply={(message) => setReplyTarget(message)}
          onEdit={(message) => {
            setEditError('');
            setEditingMessageId(message.id);
          }}
          onCancelEdit={() => {
            setEditingMessageId(null);
            setEditError('');
          }}
          onSaveEdit={handleSaveEdit}
          onDelete={(message) => setDeleteTarget(message)}
          onToggleReaction={handleToggleReaction}
          onRetry={sender.retry}
          onRemoveFailed={sender.remove}
        />
      )}

      {showUnavailable ? null : (
        <MessageComposer
          replyReference={replyReferenceForComposer}
          onCancelReply={() => setReplyTarget(null)}
          onSend={handleSend}
          autoFocusKey={conversationId}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this message?"
        description={
          <p>
            This removes the visible content for everyone but leaves a placeholder in the
            conversation. This cannot be undone.
          </p>
        }
        confirmLabel="Delete message"
        tone="danger"
        isPending={mutations.remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
