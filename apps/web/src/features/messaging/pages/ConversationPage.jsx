import { useParams } from 'react-router-dom';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { ConfirmDialog } from '../../contacts/components/ConfirmDialog.jsx';
import { ConversationHeader } from '../components/ConversationHeader.jsx';
import { MessageList } from '../components/MessageList.jsx';
import { MessageComposer } from '../components/MessageComposer.jsx';
import { MessagingUnavailableBanner } from '../components/MessagingUnavailableBanner.jsx';
import { MessagingError } from '../components/MessagingFeedback.jsx';
import { ImageViewer } from '../components/ImageViewer.jsx';
import { ForwardToAiDialog } from '../components/ForwardToAiDialog.jsx';
import { useConversationController } from '../hooks/useConversationController.js';
import { messagingErrorMessage } from '../api/messagingErrorMessages.js';

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
  const controller = useConversationController(conversationId);

  if (!controller.isValidId || controller.accessDenied) {
    return <UnavailableConversation />;
  }

  const {
    peer,
    name,
    presence,
    realtimeStatus,
    summary,
    mute,
    messagesState,
    sender,
    textDraft,
    attachmentDraft,
    typing,
    peerReceipt,
    canSend,
    showUnavailable,
    targetMessageId,
    actionError,
    replyReferenceForComposer,
    activeEditingId,
    editState,
    selection,
    dialogs,
    mutations,
    cancelSelection,
    setReplyTarget,
    setEditingMessageId,
    setEditError,
    handleSend,
    handleSaveEdit,
    loadMessageWindow,
    confirmDelete,
    handleToggleReaction,
    currentUserId,
  } = controller;

  return (
    <section className="conversation-page" aria-label={`Conversation with ${name}`}>
      <ConversationHeader
        peer={peer}
        realtimeStatus={realtimeStatus}
        presence={presence}
        isTyping={typing.peerTyping}
        isMuted={summary?.is_muted}
        onMuteChange={(value) => {
          if (value === 'hour') mute.mutate({ durationSeconds: 3600, forever: false });
          if (value === 'eight') mute.mutate({ durationSeconds: 28800, forever: false });
          if (value === 'week') mute.mutate({ durationSeconds: 604800, forever: false });
          if (value === 'forever') mute.mutate({ durationSeconds: null, forever: true });
          if (value === '') mute.mutate({ durationSeconds: null, forever: false });
        }}
        onSelectMessages={() => selection.setSelectionMode(true)}
        canSelectMessages={selection.selectableMessageCount > 0}
        selectionMode={selection.selectionMode}
      />

      {showUnavailable ? <MessagingUnavailableBanner /> : null}
      <FormStatus message={actionError} tone="error" />
      {selection.selectionMode ? (
        <div className="message-selection-toolbar" role="region" aria-label="Message selection">
          <span>{selection.selectedMessageIds.size} selected · maximum 20</span>
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
              onClick={() => dialogs.setForwardDialogOpen(true)}
              disabled={selection.selectedMessageIds.size === 0}
            >
              Send to AI
            </button>
          </div>
        </div>
      ) : null}

      {messagesState.isError ? (
        <MessagingError
          message={messagingErrorMessage(messagesState.error)}
          onRetry={() => messagesState.refetch()}
        />
      ) : (
        <MessageList
          messages={messagesState.messages}
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
          editState={editState}
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
          onDelete={(message) => dialogs.setDeleteTarget(message)}
          onToggleReaction={handleToggleReaction}
          onRetry={sender.retry}
          onRemoveFailed={sender.remove}
          onOpenImage={dialogs.setViewerAttachment}
          selectionMode={selection.selectionMode}
          selectedMessageIds={selection.selectedMessageIds}
          onSelectMessage={selection.selectMessage}
          highlightMessageId={targetMessageId}
          onLoadMessageWindow={loadMessageWindow}
        />
      )}

      {showUnavailable || selection.selectionMode ? null : (
        <MessageComposer
          replyReference={replyReferenceForComposer}
          onCancelReply={() => setReplyTarget(null)}
          onSend={handleSend}
          autoFocusKey={conversationId}
          initialValue={textDraft.value}
          onDraftChange={textDraft.update}
          attachments={attachmentDraft}
          onTypingChange={typing.update}
          onBlur={typing.stop}
        />
      )}

      <ImageViewer
        attachment={dialogs.viewerAttachment}
        onClose={() => dialogs.setViewerAttachment(null)}
      />

      <ConfirmDialog
        open={Boolean(dialogs.deleteTarget)}
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
        onCancel={() => dialogs.setDeleteTarget(null)}
      />

      {dialogs.forwardDialogOpen ? (
        <ForwardToAiDialog
          open
          sourceConversationId={conversationId}
          messages={selection.selectedMessages}
          currentUserId={currentUserId}
          contactName={name}
          onCancel={() => dialogs.setForwardDialogOpen(false)}
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
