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
  const lastRef = useRef({
    clientMessageId: null,
    content: null,
    attachments: [],
    documents: [],
    contextImport: null,
    contextCard: null,
  });

  useEffect(() => {
    abortRef.current?.abort();
    for (const attachment of lastRef.current.attachments) {
      revokeAiImagePreview(attachment.previewUrl);
    }
    dispatch({ type: 'reset' });
  }, [conversationId]);

  const run = useCallback(
    async (
      clientMessageId,
      content,
      attachments = [],
      documents = [],
      contextImport = null,
      contextCard = null,
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      lastRef.current = {
        clientMessageId,
        content,
        attachments,
        documents,
        contextImport,
        contextCard,
      };
      const visibleContent =
        contextImport && content.trim() === '' ? 'Please review the forwarded context.' : content;
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
      const messageDocuments = documents.map((document) => ({
        id: document.attachmentId,
        original_filename: document.filename,
        mime_type: document.mimeType,
        size_bytes: document.sizeBytes,
        page_count: null,
        status: 'attached',
        created_at: new Date().toISOString(),
      }));

      dispatch({
        type: 'start',
        userMessage: {
          id: clientMessageId,
          conversation_id: conversationId,
          role: 'user',
          content: visibleContent,
          client_message_id: clientMessageId,
          created_at: new Date().toISOString(),
          attachments: messageAttachments,
          documents: messageDocuments,
          context_import: contextCard,
        },
      });

      try {
        await streamAiChat({
          conversationId,
          clientMessageId,
          content,
          attachmentIds: attachments.map((attachment) => attachment.attachmentId),
          documentAttachmentIds: documents.map((document) => document.attachmentId),
          contextImport,
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
                  content: visibleContent,
                  client_message_id: clientMessageId,
                  created_at: new Date().toISOString(),
                  attachments: messageAttachments.map(({ preview_url: _preview, ...item }) => item),
                  documents: messageDocuments,
                  context_import: contextCard,
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
    (content, attachments = [], documents = []) => {
      const trimmed = typeof content === 'string' ? content.trim() : '';
      if (trimmed === '' || state.status === 'streaming') return;
      for (const previous of lastRef.current.attachments) {
        revokeAiImagePreview(previous.previewUrl);
      }
      run(globalThis.crypto.randomUUID(), trimmed, attachments, documents);
      return true;
    },
    [run, state.status],
  );

  const sendForwarded = useCallback(
    ({
      clientRequestId,
      instruction = '',
      sourceConversationId,
      sourceMessageIds,
      contextCard,
    }) => {
      if (state.status === 'streaming') return false;
      const trimmed = typeof instruction === 'string' ? instruction.trim() : '';
      run(
        clientRequestId,
        trimmed,
        [],
        [],
        {
          source_conversation_id: sourceConversationId,
          source_message_ids: sourceMessageIds,
        },
        contextCard,
      );
      return true;
    },
    [run, state.status],
  );

  const retry = useCallback(() => {
    if (state.status === 'streaming') return;
    const { clientMessageId, content, attachments, documents, contextImport, contextCard } =
      lastRef.current;
    if (clientMessageId && (content || contextImport)) {
      run(clientMessageId, content, attachments, documents, contextImport, contextCard);
    }
  }, [run, state.status]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return {
    status: state.status,
    isStreaming: state.status === 'streaming',
    pendingUserMessage: state.userMessage,
    assistantText: state.assistantText,
    errorCategory: state.errorCategory,
    send,
    sendForwarded,
    retry,
    stop,
  };
}
