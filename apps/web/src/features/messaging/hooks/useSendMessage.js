import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { messagingKeys } from '../../../lib/query-keys/messaging.js';
import { sendMessage } from '../api/messagingApi.js';
import { removeMessageAttachment } from '../api/attachmentsApi.js';
import { upsertMessage } from '../queries/messageCache.js';
import { evictAttachmentUrls } from '../queries/attachmentUrlCache.js';
import { revokePreviewUrl } from '../utils/attachments.js';
import {
  listQueuedMessagesForConversation,
  persistQueuedMessage,
  queuedMessageToOutgoing,
  removeQueuedMessage,
} from '../utils/offlineQueue.js';

// Optimistic send pipeline for one conversation. Each send gets a client-side
// UUID used as the backend idempotency key; a retry reuses the same id, content,
// and finalized attachment IDs so the server returns the original row instead of
// inserting twice or re-attaching. Optimistic placeholders carry local image
// previews (object URLs) that are revoked once the authoritative row arrives or
// the placeholder is removed.

const STATUS = { sending: 'sending', failed: 'failed', queued: 'queued' };

function reducer(state, action) {
  switch (action.type) {
    case 'enqueue':
      if (state.some((item) => item.clientMessageId === action.item.clientMessageId)) {
        return state.map((item) =>
          item.clientMessageId === action.item.clientMessageId ? { ...item, ...action.item } : item,
        );
      }
      return [...state, action.item];
    case 'sending':
      return state.map((item) =>
        item.clientMessageId === action.clientMessageId
          ? { ...item, status: STATUS.sending, errorCategory: null }
          : item,
      );
    case 'queued':
      return state.map((item) =>
        item.clientMessageId === action.clientMessageId
          ? { ...item, status: STATUS.queued, errorCategory: null }
          : item,
      );
    case 'failed':
      return state.map((item) =>
        item.clientMessageId === action.clientMessageId
          ? { ...item, status: STATUS.failed, errorCategory: action.errorCategory }
          : item,
      );
    case 'remove':
      return state.filter((item) => item.clientMessageId !== action.clientMessageId);
    case 'reset':
      return [];
    default:
      return state;
  }
}

function newClientMessageId() {
  return globalThis.crypto.randomUUID();
}

function isNetworkOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function revokeItemPreviews(item) {
  for (const attachment of item?.attachments ?? []) revokePreviewUrl(attachment.previewUrl);
}

function toStoredQueueItem({ userId, conversationId, clientMessageId, content, replyToMessageId }) {
  return {
    userId,
    conversationId,
    clientMessageId,
    content,
    replyToMessageId: replyToMessageId ?? null,
    createdAt: new Date().toISOString(),
  };
}

export function useSendMessage(conversationId, userId = null) {
  const queryClient = useQueryClient();
  const [outgoing, dispatch] = useReducer(reducer, []);
  const outgoingRef = useRef(outgoing);
  const drainingRef = useRef(false);
  useEffect(() => {
    outgoingRef.current = outgoing;
  }, [outgoing]);

  // Optimistic state is per-conversation; clear it when the conversation changes,
  // revoking any object URLs still held by pending placeholders.
  useEffect(() => {
    return () => {
      for (const item of outgoingRef.current) revokeItemPreviews(item);
    };
  }, [conversationId]);
  useEffect(() => {
    dispatch({ type: 'reset' });
    const queued = listQueuedMessagesForConversation(userId, conversationId)
      .map(queuedMessageToOutgoing)
      .filter(Boolean);
    for (const item of queued) dispatch({ type: 'enqueue', item });
  }, [conversationId, userId]);

  const runSend = useCallback(
    async ({ clientMessageId, content, replyToMessageId, attachmentIds = [] }) => {
      const canPersistOffline =
        userId && typeof content === 'string' && content.length > 0 && attachmentIds.length === 0;

      if (canPersistOffline && !isNetworkOnline()) {
        const queued = persistQueuedMessage(
          toStoredQueueItem({ userId, conversationId, clientMessageId, content, replyToMessageId }),
        );
        dispatch({
          type: queued ? 'queued' : 'failed',
          clientMessageId,
          errorCategory: queued ? null : 'backend_unavailable',
        });
        return { ok: false, queued, error: null };
      }

      dispatch({ type: 'sending', clientMessageId });
      try {
        const message = await sendMessage({
          conversation_id: conversationId,
          client_message_id: clientMessageId,
          content,
          reply_to_message_id: replyToMessageId ?? null,
          attachment_ids: attachmentIds ?? [],
        });
        // Write the authoritative row, then drop the optimistic placeholder so
        // the realtime echo / any refetch cannot produce a duplicate.
        upsertMessage(queryClient, conversationId, message);
        queryClient.invalidateQueries({ queryKey: messagingKeys.conversations() });
        const item = outgoingRef.current.find((entry) => entry.clientMessageId === clientMessageId);
        revokeItemPreviews(item);
        if (userId) removeQueuedMessage(userId, clientMessageId);
        dispatch({ type: 'remove', clientMessageId });
        return { ok: true, message };
      } catch (error) {
        const errorCategory = error?.category ?? 'unknown_error';
        if (canPersistOffline && errorCategory === 'backend_unavailable') {
          const queued = persistQueuedMessage(
            toStoredQueueItem({
              userId,
              conversationId,
              clientMessageId,
              content,
              replyToMessageId,
            }),
          );
          dispatch({
            type: queued ? 'queued' : 'failed',
            clientMessageId,
            errorCategory: queued ? null : errorCategory,
          });
          return { ok: false, queued, error };
        }
        if (userId) removeQueuedMessage(userId, clientMessageId);
        dispatch({
          type: 'failed',
          clientMessageId,
          errorCategory,
        });
        return { ok: false, error };
      }
    },
    [conversationId, queryClient, userId],
  );

  const drainQueued = useCallback(async () => {
    if (!userId || !conversationId || drainingRef.current || !isNetworkOnline()) return;
    const queuedItems = listQueuedMessagesForConversation(userId, conversationId);
    if (queuedItems.length === 0) return;

    drainingRef.current = true;
    try {
      for (const queuedItem of queuedItems) {
        const outgoingItem = queuedMessageToOutgoing(queuedItem);
        if (outgoingItem) dispatch({ type: 'enqueue', item: outgoingItem });
        await runSend({
          clientMessageId: queuedItem.clientMessageId,
          content: queuedItem.content,
          replyToMessageId: queuedItem.replyToMessageId,
          attachmentIds: [],
        });
      }
    } finally {
      drainingRef.current = false;
    }
  }, [conversationId, runSend, userId]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    drainQueued();
    const onResume = () => {
      drainQueued();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') drainQueued();
    };
    window.addEventListener('online', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [drainQueued]);

  const send = useCallback(
    (content, replyToMessageId = null, attachmentDrafts = []) => {
      const trimmed = typeof content === 'string' ? content.trim() : '';
      if (trimmed === '' && attachmentDrafts.length === 0) return null;

      const attachments = attachmentDrafts.map((draft) => ({
        id: draft.attachmentId,
        isImage: draft.isImage,
        previewUrl: draft.previewUrl,
        filename: draft.filename,
        mimeType: draft.mimeType,
        sizeBytes: draft.sizeBytes,
      }));
      const attachmentIds = attachments.map((attachment) => attachment.id);
      const clientMessageId = newClientMessageId();

      dispatch({
        type: 'enqueue',
        item: {
          clientMessageId,
          content: trimmed,
          replyToMessageId: replyToMessageId ?? null,
          attachments,
          attachmentIds,
          createdAt: new Date().toISOString(),
          status: STATUS.sending,
          errorCategory: null,
        },
      });
      runSend({ clientMessageId, content: trimmed, replyToMessageId, attachmentIds });
      return clientMessageId;
    },
    [runSend],
  );

  const retry = useCallback(
    (clientMessageId) => {
      const item = outgoingRef.current.find((entry) => entry.clientMessageId === clientMessageId);
      if (!item) return;
      // Same client id + payload + attachment IDs → idempotent on the backend.
      runSend({
        clientMessageId,
        content: item.content,
        replyToMessageId: item.replyToMessageId,
        attachmentIds: item.attachmentIds,
      });
    },
    [runSend],
  );

  const remove = useCallback(
    (clientMessageId) => {
      const item = outgoingRef.current.find((entry) => entry.clientMessageId === clientMessageId);
      if (userId) removeQueuedMessage(userId, clientMessageId);
      if (item) {
        revokeItemPreviews(item);
        // A permanently abandoned send leaves its uploads unattached; clean them up.
        for (const attachmentId of item.attachmentIds ?? []) {
          removeMessageAttachment(attachmentId).catch(() => {});
        }
        evictAttachmentUrls(item.attachmentIds ?? []);
      }
      dispatch({ type: 'remove', clientMessageId });
    },
    [userId],
  );

  return { outgoing, send, retry, remove };
}
