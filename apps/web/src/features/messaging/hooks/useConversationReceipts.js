import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { markConversationDelivered, markConversationRead } from '../api/messagingApi.js';
import { patchConversationReceipt } from '../queries/conversationCache.js';

// Advances the caller's own delivered/read receipts honestly and monotonically.
// Delivered advances whenever the open conversation has reconciled messages;
// read advances only while the conversation is active and the document is
// visible. Updates are debounced and never sent backwards or repeatedly for the
// same value. The local unread badge is cleared by patching the inbox cache.
export function useConversationReceipts({ conversationId, targetSequence, isActive }) {
  const queryClient = useQueryClient();
  const deliveredRef = useRef(0);
  const readRef = useRef(0);
  const [resumeTick, setResumeTick] = useState(0);

  useEffect(() => {
    deliveredRef.current = 0;
    readRef.current = 0;
  }, [conversationId]);

  useEffect(() => {
    function onResume() {
      setResumeTick((tick) => tick + 1);
    }
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
    };
  }, []);

  useEffect(() => {
    if (!conversationId || !targetSequence || targetSequence <= 0) return undefined;

    const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
    const shouldRead = Boolean(isActive) && visible;
    const threshold = shouldRead ? readRef.current : deliveredRef.current;
    if (targetSequence <= threshold) return undefined;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const receipt = shouldRead
          ? await markConversationRead({
              conversation_id: conversationId,
              through_sequence: targetSequence,
            })
          : await markConversationDelivered({
              conversation_id: conversationId,
              through_sequence: targetSequence,
            });
        if (cancelled) return;
        deliveredRef.current = Math.max(deliveredRef.current, receipt.last_delivered_sequence);
        readRef.current = Math.max(readRef.current, receipt.last_read_sequence);
        patchConversationReceipt(queryClient, conversationId, receipt);
      } catch {
        // Receipt advancement is monotonic and best-effort; a failure simply
        // leaves the threshold unchanged so the next render retries.
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [conversationId, targetSequence, isActive, resumeTick, queryClient]);
}
