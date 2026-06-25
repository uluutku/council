import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../app/providers/AuthContext.js';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { messagingKeys } from '../../../lib/query-keys/messaging.js';
import { getMessageWindow, setConversationMute } from '../api/messagingApi.js';
import { isConversationAccessError, messagingErrorMessage } from '../api/messagingErrorMessages.js';
import { useAttachmentDraft } from './useAttachmentDraft.js';
import { useConversationDraft } from './useConversationDraft.js';
import { useConversationDialogs } from './useConversationDialogs.js';
import { useConversationMessages } from './useConversationMessages.js';
import { useConversationRealtime } from './useConversationRealtime.js';
import { useConversationReceipts } from './useConversationReceipts.js';
import { useConversationSelection } from './useConversationSelection.js';
import { useConversationSummary } from './useConversationSummary.js';
import { useMessageMutations } from './useMessageMutations.js';
import { usePresence } from './usePresence.js';
import { useSendMessage } from './useSendMessage.js';
import { useTypingIndicator } from './useTypingIndicator.js';
import { conversationPeer, peerName } from '../utils/peer.js';
import { highestLoadedSequence } from '../utils/messageList.js';
import { previewExcerpt } from '../utils/messageContent.js';
import { mergePeerReceipt } from '../utils/receipts.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useConversationController(conversationId) {
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const currentUserId = user?.id ?? null;
  const isValidId = typeof conversationId === 'string' && UUID_PATTERN.test(conversationId);

  const { summary } = useConversationSummary(isValidId ? conversationId : null);
  const messagesState = useConversationMessages(isValidId ? conversationId : null);
  const messages = messagesState.messages;
  const mutations = useMessageMutations(conversationId);
  const sender = useSendMessage(conversationId, currentUserId);
  const textDraft = useConversationDraft(currentUserId, conversationId);
  const attachmentDraft = useAttachmentDraft(conversationId);
  const typing = useTypingIndicator(isValidId ? conversationId : null);
  const selection = useConversationSelection(messages);
  const dialogs = useConversationDialogs(messages);

  const [peerReceipt, setPeerReceipt] = useState({ readSequence: 0, deliveredSequence: 0 });
  const [replyTarget, setReplyTarget] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editError, setEditError] = useState('');
  const [actionError, setActionError] = useState('');
  const targetMessageId =
    location.state?.messageId ?? new URLSearchParams(location.search).get('message');

  const handlePeerReceipt = useCallback((receipt) => {
    setPeerReceipt((current) => mergePeerReceipt(current, receipt));
  }, []);

  const { status: realtimeStatus } = useConversationRealtime({
    conversationId: isValidId ? conversationId : null,
    currentUserId,
    onPeerReceipt: handlePeerReceipt,
  });

  const targetSequence = useMemo(() => highestLoadedSequence(messages), [messages]);

  useConversationReceipts({
    conversationId: isValidId ? conversationId : null,
    targetSequence,
    isActive: true,
  });

  const peer = useMemo(
    () => conversationPeer(summary) ?? location.state?.peer ?? null,
    [summary, location.state],
  );
  const presenceMap = usePresence(peer?.id ? [peer.id] : []);
  const presence = peer?.id ? (presenceMap.get(peer.id) ?? null) : null;
  const name = peer ? peerName(peer) : 'Conversation';
  usePageTitle(name === 'Conversation' ? 'Messages' : name);

  const mute = useMutation({
    mutationFn: ({ durationSeconds, forever }) =>
      setConversationMute({
        conversation_id: conversationId,
        duration_seconds: durationSeconds,
        forever,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: messagingKeys.conversations() }),
  });

  const resolvedCanSend = summary ? summary.can_send : (location.state?.canSend ?? null);
  const canSend = resolvedCanSend !== false;
  const showUnavailable = resolvedCanSend === false;
  const activeEditingId = canSend ? editingMessageId : null;

  useEffect(() => {
    if (!isValidId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector('.conversation-header-name')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversationId, isValidId]);

  useEffect(() => {
    if (!isValidId || !targetMessageId) return;
    getMessageWindow(conversationId, targetMessageId)
      .then((windowMessages) => {
        queryClient.setQueryData(messagingKeys.messages(conversationId), {
          pages: [windowMessages],
          pageParams: [null],
        });
      })
      .catch(() => {});
  }, [conversationId, isValidId, queryClient, targetMessageId]);

  const loadMessageWindow = useCallback(
    async (messageId) => {
      if (!isValidId || !messageId) return;
      const windowMessages = await getMessageWindow(conversationId, messageId);
      queryClient.setQueryData(messagingKeys.messages(conversationId), {
        pages: [windowMessages],
        pageParams: [null],
      });
    },
    [conversationId, isValidId, queryClient],
  );

  const cancelSelection = useCallback(() => {
    dialogs.setForwardDialogOpen(false);
    selection.cancelSelection();
  }, [dialogs, selection]);

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
      typing.stop();
      const drafts = attachmentDraft.hasAny ? attachmentDraft.consume() : [];
      const clientMessageId = sender.send(content, replyTarget?.id ?? null, drafts);
      if (clientMessageId) {
        textDraft.clear();
        setReplyTarget(null);
      }
      return clientMessageId;
    },
    [sender, replyTarget, attachmentDraft, textDraft, typing],
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
    if (!dialogs.deleteTarget) return;
    setActionError('');
    try {
      await mutations.remove.mutateAsync({ messageId: dialogs.deleteTarget.id });
    } catch (error) {
      setActionError(messagingErrorMessage(error));
    } finally {
      dialogs.setDeleteTarget(null);
    }
  }, [dialogs, mutations.remove]);

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

  const accessDenied = messagesState.isError && isConversationAccessError(messagesState.error);

  return {
    isValidId,
    accessDenied,
    conversationId,
    currentUserId,
    peer,
    name,
    presence,
    realtimeStatus,
    summary,
    mute,
    messagesState,
    messages,
    sender,
    textDraft,
    attachmentDraft,
    typing,
    peerReceipt,
    canSend,
    showUnavailable,
    targetMessageId,
    actionError: actionError || selection.selectionError,
    replyReferenceForComposer,
    activeEditingId,
    editState: { isSaving: mutations.edit.isPending, errorMessage: editError },
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
  };
}
