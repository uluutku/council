import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { aiKeys } from '../../../lib/query-keys/ai.js';
import { streamAiChat } from '../api/aiChatStream.js';
import { appendAiMessages, setAiAccessCredits } from '../queries/aiMessageCache.js';
import { revokeAiImagePreview } from '../utils/aiImages.js';

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
  const lastRef = useRef({ clientMessageId: null, content: null, attachments: [] });

  useEffect(() => {
    abortRef.current?.abort();
    for (const attachment of lastRef.current.attachments) {
      revokeAiImagePreview(attachment.previewUrl);
    }
    dispatch({ type: 'reset' });
  }, [conversationId]);

  const run = useCallback(
    async (clientMessageId, content, attachments = []) => {
      const controller = new AbortController();
      abortRef.current = controller;
      lastRef.current = { clientMessageId, content, attachments };
      const messageAttachments = attachments.map((attachment) => ({
        id: attachment.attachmentId,
        storage_bucket: attachment.storageBucket,
        storage_path: attachment.storagePath,
        original_filename: attachment.filename,
        mime_type: attachment.mimeType,
        size_bytes: attachment.sizeBytes,
        width: attachment.width,
        height: attachment.height,
        created_at: new Date().toISOString(),
        preview_url: attachment.previewUrl,
      }));

      dispatch({
        type: 'start',
        userMessage: {
          id: clientMessageId,
          conversation_id: conversationId,
          role: 'user',
          content,
          client_message_id: clientMessageId,
          created_at: new Date().toISOString(),
          attachments: messageAttachments,
        },
      });

      try {
        await streamAiChat({
          conversationId,
          clientMessageId,
          content,
          attachmentIds: attachments.map((attachment) => attachment.attachmentId),
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
                  attachments: messageAttachments.map(({ preview_url: _preview, ...item }) => item),
                },
                {
                  ...event.message,
                  conversation_id: conversationId,
                  client_message_id: event.message.id,
                },
              ]);
              for (const attachment of attachments) {
                revokeAiImagePreview(attachment.previewUrl);
              }
              lastRef.current.attachments = [];
              dispatch({ type: 'reset' });
              queryClient.invalidateQueries({ queryKey: aiKeys.messages(conversationId) });
              queryClient.invalidateQueries({ queryKey: aiKeys.access() });
              queryClient.invalidateQueries({ queryKey: aiKeys.conversations() });
            } else if (event.type === 'error') {
              setAiAccessCredits(queryClient, event.credits_remaining);
              queryClient.invalidateQueries({ queryKey: aiKeys.access() });
              queryClient.invalidateQueries({ queryKey: aiKeys.messages(conversationId) });
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
          for (const attachment of attachments) {
            revokeAiImagePreview(attachment.previewUrl);
          }
          lastRef.current.attachments = [];
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
    (content, attachments = []) => {
      const trimmed = typeof content === 'string' ? content.trim() : '';
      if (trimmed === '' || state.status === 'streaming') return;
      for (const previous of lastRef.current.attachments) {
        revokeAiImagePreview(previous.previewUrl);
      }
      run(globalThis.crypto.randomUUID(), trimmed, attachments);
      return true;
    },
    [run, state.status],
  );

  const retry = useCallback(() => {
    if (state.status === 'streaming') return;
    const { clientMessageId, content, attachments } = lastRef.current;
    if (clientMessageId && content) run(clientMessageId, content, attachments);
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
