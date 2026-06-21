import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { messagingKeys } from '../../../lib/query-keys/messaging.js';
import { sendMessage } from '../api/messagingApi.js';
import { upsertMessage } from '../queries/messageCache.js';

// Optimistic send pipeline for one conversation. Each send gets a client-side
// UUID used as the backend idempotency key; a retry reuses the same id and
// payload so the server returns the original row instead of inserting twice.
// Optimistic placeholders live here (never in the message query cache); on
// confirmation the authoritative row is written to the cache and the
// placeholder is dropped, so every path converges to exactly one message.

const STATUS = { sending: 'sending', failed: 'failed' };

function reducer(state, action) {
  switch (action.type) {
    case 'enqueue':
      return [...state, action.item];
    case 'sending':
      return state.map((item) =>
        item.clientMessageId === action.clientMessageId
          ? { ...item, status: STATUS.sending, errorCategory: null }
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

export function useSendMessage(conversationId) {
  const queryClient = useQueryClient();
  const [outgoing, dispatch] = useReducer(reducer, []);
  const outgoingRef = useRef(outgoing);
  useEffect(() => {
    outgoingRef.current = outgoing;
  }, [outgoing]);

  // Optimistic state is per-conversation; clear it when the conversation changes.
  useEffect(() => {
    dispatch({ type: 'reset' });
  }, [conversationId]);

  const runSend = useCallback(
    async ({ clientMessageId, content, replyToMessageId }) => {
      dispatch({ type: 'sending', clientMessageId });
      try {
        const message = await sendMessage({
          conversation_id: conversationId,
          client_message_id: clientMessageId,
          content,
          reply_to_message_id: replyToMessageId ?? null,
        });
        // Write the authoritative row, then drop the optimistic placeholder so
        // the realtime echo / any refetch cannot produce a duplicate.
        upsertMessage(queryClient, conversationId, message);
        queryClient.invalidateQueries({ queryKey: messagingKeys.conversations() });
        dispatch({ type: 'remove', clientMessageId });
        return { ok: true, message };
      } catch (error) {
        dispatch({
          type: 'failed',
          clientMessageId,
          errorCategory: error?.category ?? 'unknown_error',
        });
        return { ok: false, error };
      }
    },
    [conversationId, queryClient],
  );

  const send = useCallback(
    (content, replyToMessageId = null) => {
      const trimmed = typeof content === 'string' ? content.trim() : '';
      if (trimmed === '') return null;

      const clientMessageId = newClientMessageId();
      dispatch({
        type: 'enqueue',
        item: {
          clientMessageId,
          content: trimmed,
          replyToMessageId: replyToMessageId ?? null,
          createdAt: new Date().toISOString(),
          status: STATUS.sending,
          errorCategory: null,
        },
      });
      runSend({ clientMessageId, content: trimmed, replyToMessageId });
      return clientMessageId;
    },
    [runSend],
  );

  const retry = useCallback(
    (clientMessageId) => {
      const item = outgoingRef.current.find((entry) => entry.clientMessageId === clientMessageId);
      if (!item) return;
      // Same client id + payload → idempotent on the backend.
      runSend({
        clientMessageId,
        content: item.content,
        replyToMessageId: item.replyToMessageId,
      });
    },
    [runSend],
  );

  const remove = useCallback((clientMessageId) => {
    dispatch({ type: 'remove', clientMessageId });
  }, []);

  return { outgoing, send, retry, remove };
}
