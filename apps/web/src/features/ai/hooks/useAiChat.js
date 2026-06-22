import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { aiKeys } from '../../../lib/query-keys/ai.js';
import { streamAiChat } from '../api/aiChatStream.js';
import { appendAiMessages, setAiAccessCredits } from '../queries/aiMessageCache.js';

// Owns the in-flight exchange for one AI conversation: the optimistic user
// message, the streaming assistant text, and a retryable error state. The
// persisted message history stays in the TanStack Query cache; this hook never
// fabricates an assistant message it did not receive. A retry reuses the same
// client id so the backend neither duplicates the user message nor double-spends
// a credit.

const INITIAL = { status: 'idle', userMessage: null, assistantText: '', errorCategory: null };

function reducer(state, action) {
  switch (action.type) {
    case 'start':
      return {
        status: 'streaming',
        userMessage: action.userMessage,
        assistantText: '',
        errorCategory: null,
      };
    case 'delta':
      return { ...state, assistantText: state.assistantText + action.text };
    case 'error':
      return {
        status: 'error',
        userMessage: state.userMessage,
        assistantText: '',
        errorCategory: action.category,
      };
    case 'reset':
      return INITIAL;
    default:
      return state;
  }
}

export function useAiChat(conversationId) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const abortRef = useRef(null);
  const lastRef = useRef({ clientMessageId: null, content: null });

  useEffect(() => {
    abortRef.current?.abort();
    dispatch({ type: 'reset' });
  }, [conversationId]);

  const run = useCallback(
    async (clientMessageId, content) => {
      const controller = new AbortController();
      abortRef.current = controller;
      lastRef.current = { clientMessageId, content };

      dispatch({
        type: 'start',
        userMessage: {
          id: clientMessageId,
          conversation_id: conversationId,
          role: 'user',
          content,
          client_message_id: clientMessageId,
          created_at: new Date().toISOString(),
        },
      });

      try {
        await streamAiChat({
          conversationId,
          clientMessageId,
          content,
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === 'delta') {
              dispatch({ type: 'delta', text: event.text });
            } else if (event.type === 'done') {
              setAiAccessCredits(queryClient, event.credits_remaining);
              // Keep the exchange visible by appending it, then reconcile to the
              // authoritative rows in the background.
              appendAiMessages(queryClient, conversationId, [
                {
                  id: clientMessageId,
                  conversation_id: conversationId,
                  role: 'user',
                  content,
                  client_message_id: clientMessageId,
                  created_at: new Date().toISOString(),
                },
                {
                  ...event.message,
                  conversation_id: conversationId,
                  client_message_id: event.message.id,
                },
              ]);
              dispatch({ type: 'reset' });
              queryClient.invalidateQueries({ queryKey: aiKeys.messages(conversationId) });
              queryClient.invalidateQueries({ queryKey: aiKeys.access() });
              queryClient.invalidateQueries({ queryKey: aiKeys.conversations() });
            } else if (event.type === 'error') {
              setAiAccessCredits(queryClient, event.credits_remaining);
              queryClient.invalidateQueries({ queryKey: aiKeys.access() });
              dispatch({ type: 'error', category: event.category });
            }
          },
        });
      } catch (error) {
        const category = error?.category ?? 'unknown_error';
        queryClient.invalidateQueries({ queryKey: aiKeys.access() });
        if (category === 'cancelled') {
          // The server cancels and refunds; pull the truthful history back.
          dispatch({ type: 'reset' });
          queryClient.invalidateQueries({ queryKey: aiKeys.messages(conversationId) });
        } else {
          dispatch({ type: 'error', category });
        }
      } finally {
        abortRef.current = null;
      }
    },
    [conversationId, queryClient],
  );

  const send = useCallback(
    (content) => {
      const trimmed = typeof content === 'string' ? content.trim() : '';
      if (trimmed === '' || state.status === 'streaming') return;
      run(globalThis.crypto.randomUUID(), trimmed);
    },
    [run, state.status],
  );

  const retry = useCallback(() => {
    if (state.status === 'streaming') return;
    const { clientMessageId, content } = lastRef.current;
    if (clientMessageId && content) run(clientMessageId, content);
  }, [run, state.status]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return {
    status: state.status,
    isStreaming: state.status === 'streaming',
    pendingUserMessage: state.userMessage,
    assistantText: state.assistantText,
    errorCategory: state.errorCategory,
    send,
    retry,
    stop,
  };
}
