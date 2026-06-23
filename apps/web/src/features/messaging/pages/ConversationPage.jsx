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
import { ImageViewer } from '../components/ImageViewer.jsx';
import { ForwardToAiDialog } from '../components/ForwardToAiDialog.jsx';
import { useConversationSummary } from '../hooks/useConversationSummary.js';
import { useConversationMessages } from '../hooks/useConversationMessages.js';
import { useConversationRealtime } from '../hooks/useConversationRealtime.js';
import { useSendMessage } from '../hooks/useSendMessage.js';
import { useAttachmentDraft } from '../hooks/useAttachmentDraft.js';
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

function ConversationPageContent({ conversationId }) {
  const location = useLocation();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const isValidId = typeof conversationId === 'string' && UUID_PATTERN.test(conversationId);

  const { summary } = useConversationSummary(isValidId ? conversationId : null);
  const messagesState = useConversationMessages(isValidId ? conversationId : null);
  const mutations = useMessageMutations(conversationId);
  const sender = useSendMessage(conversationId);
  const attachmentDraft = useAttachmentDraft(conversationId);

  const [peerReceipt, setPeerReceipt] = useState({ readSequence: 0, deliveredSequence: 0 });
  const [replyTarget, setReplyTarget] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editError, setEditError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionError, setActionError] = useState('');
  const [viewerAttachment, setViewerAttachment] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState(() => new Set());
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);

  const handlePeerReceipt = useCallback((receipt) => {
    setPeerReceipt((current) => mergePeerReceipt(current, receipt));
  }, []);

  const { status: realtimeStatus } = useConversationRealtime({
    conversationId: isValidId ? conversationId : null,
    currentUserId,
    onPeerReceipt: handlePeerReceipt,
  });

  const messages = messagesState.messages;
  const selectedMessages = useMemo(
    () => messages.filter((message) => selectedMessageIds.has(message.id)),
    [messages, selectedMessageIds],
  );
  const selectableMessageCount = useMemo(
    () =>
      messages.filter((message) => message.deleted_at === null && Boolean(message.content?.trim()))
        .length,
    [messages],
  );
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

  const cancelSelection = useCallback(() => {
    setForwardDialogOpen(false);
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
  }, []);

  const handleSelectMessage = useCallback((message, selected) => {
    setActionError('');
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (selected) {
        if (next.size >= 20) {
          setActionError('You can send up to 20 messages at a time.');
          return current;
        }
        next.add(message.id);
      } else {
        next.delete(message.id);
      }
      return next;
    });
  }, []);

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
      const drafts = attachmentDraft.hasAny ? attachmentDraft.consume() : [];
      const clientMessageId = sender.send(content, replyTarget?.id ?? null, drafts);
      if (clientMessageId) setReplyTarget(null);
      return clientMessageId;
    },
    [sender, replyTarget, attachmentDraft],
  );

  // Derive the visible viewer attachment so a deleted (or paged-out) message
  // closes the viewer without a state write inside an effect.
  const activeViewerAttachment = useMemo(() => {
    if (!viewerAttachment) return null;
    const stillVisible = messages.some((message) =>
      (message.attachments ?? []).some((attachment) => attachment.id === viewerAttachment.id),
    );
    return stillVisible ? viewerAttachment : null;
  }, [messages, viewerAttachment]);

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
      <ConversationHeader peer={peer} realtimeStatus={realtimeStatus}>
        {!selectionMode ? (
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => setSelectionMode(true)}
            disabled={selectableMessageCount === 0}
          >
            Select messages
          </button>
        ) : null}
      </ConversationHeader>

      {showUnavailable ? <MessagingUnavailableBanner /> : null}
      <FormStatus message={actionError} tone="error" />
      {selectionMode ? (
        <div className="message-selection-toolbar" role="region" aria-label="Message selection">
          <span>{selectedMessageIds.size} selected · maximum 20</span>
          <div>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={cancelSelection}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button button--small"
              onClick={() => setForwardDialogOpen(true)}
              disabled={selectedMessageIds.size === 0}
            >
              Send to AI
            </button>
          </div>
        </div>
      ) : null}

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
          onOpenImage={setViewerAttachment}
          selectionMode={selectionMode}
          selectedMessageIds={selectedMessageIds}
          onSelectMessage={handleSelectMessage}
        />
      )}

      {showUnavailable || selectionMode ? null : (
        <MessageComposer
          replyReference={replyReferenceForComposer}
          onCancelReply={() => setReplyTarget(null)}
          onSend={handleSend}
          autoFocusKey={conversationId}
          attachments={attachmentDraft}
        />
      )}

      <ImageViewer attachment={activeViewerAttachment} onClose={() => setViewerAttachment(null)} />

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

      {forwardDialogOpen ? (
        <ForwardToAiDialog
          open
          sourceConversationId={conversationId}
          messages={selectedMessages}
          currentUserId={currentUserId}
          contactName={name}
          onCancel={() => setForwardDialogOpen(false)}
          onForwardingStarted={cancelSelection}
        />
      ) : null}
    </section>
  );
}

export function ConversationPage() {
  const { conversationId } = useParams();
  return <ConversationPageContent key={conversationId} conversationId={conversationId} />;
}
