import { useCallback, useState } from 'react';
import {
  clearConversationDraft,
  loadConversationDraft,
  saveConversationDraft,
} from '../utils/offlineQueue.js';

export function useConversationDraft(userId, conversationId) {
  const [, setRevision] = useState(0);
  const value = loadConversationDraft(userId, conversationId);

  const update = useCallback(
    (nextValue) => {
      const normalized = typeof nextValue === 'string' ? nextValue : '';
      saveConversationDraft(userId, conversationId, normalized);
      setRevision((current) => current + 1);
    },
    [conversationId, userId],
  );

  const clear = useCallback(() => {
    clearConversationDraft(userId, conversationId);
    setRevision((current) => current + 1);
  }, [conversationId, userId]);

  return { value, update, clear };
}
