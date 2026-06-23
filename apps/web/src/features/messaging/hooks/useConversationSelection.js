import { useCallback, useMemo, useState } from 'react';

export function useConversationSelection(messages) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState(() => new Set());
  const [selectionError, setSelectionError] = useState('');

  const selectedMessages = useMemo(
    () => messages.filter((message) => selectedMessageIds.has(message.id)),
    [messages, selectedMessageIds],
  );

  const selectableMessageCount = useMemo(
    () =>
      messages.filter((message) => message.deleted_at === null && Boolean(message.content?.trim()))
        .length,
    [messages],
  );

  const cancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
    setSelectionError('');
  }, []);

  const selectMessage = useCallback((message, selected) => {
    setSelectionError('');
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (selected) {
        if (next.size >= 20) {
          setSelectionError('You can send up to 20 messages at a time.');
          return current;
        }
        next.add(message.id);
      } else {
        next.delete(message.id);
      }
      return next;
    });
  }, []);

  return {
    selectionMode,
    setSelectionMode,
    selectedMessageIds,
    selectedMessages,
    selectableMessageCount,
    selectionError,
    cancelSelection,
    selectMessage,
  };
}
