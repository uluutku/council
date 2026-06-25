import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { messagingKeys } from '../../../lib/query-keys/messaging.js';
import { sendMessage } from '../api/messagingApi.js';
import { upsertMessage } from '../queries/messageCache.js';
import { listQueuedMessages, removeQueuedMessage } from '../utils/offlineQueue.js';

function isNetworkOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function useOfflineQueueDrain(userId, activeConversationId = null) {
  const queryClient = useQueryClient();
  const drainingRef = useRef(false);

  const drainQueued = useCallback(async () => {
    if (!userId || drainingRef.current || !isNetworkOnline()) return;
    const queuedItems = listQueuedMessages(userId).filter(
      (item) => item.conversationId !== activeConversationId,
    );
    if (queuedItems.length === 0) return;

    drainingRef.current = true;
    try {
      for (const item of queuedItems) {
        try {
          const message = await sendMessage({
            conversation_id: item.conversationId,
            client_message_id: item.clientMessageId,
            content: item.content,
            reply_to_message_id: item.replyToMessageId,
            attachment_ids: [],
          });
          removeQueuedMessage(userId, item.clientMessageId);
          upsertMessage(queryClient, item.conversationId, message);
          queryClient.invalidateQueries({ queryKey: messagingKeys.conversations() });
        } catch (error) {
          if (error?.category && error.category !== 'backend_unavailable') {
            removeQueuedMessage(userId, item.clientMessageId);
          }
        }
      }
    } finally {
      drainingRef.current = false;
    }
  }, [activeConversationId, queryClient, userId]);

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
}
