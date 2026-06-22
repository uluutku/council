import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aiKeys } from '../../../lib/query-keys/ai.js';
import {
  createAiMemory,
  deleteAiMemory,
  deleteAllAiMemories,
  setAiMemoryMode,
  updateAiMemory,
} from '../api/aiApi.js';

export function useAiMemoryMutations(conversationId) {
  const queryClient = useQueryClient();
  const invalidateMemories = () =>
    queryClient.invalidateQueries({ queryKey: aiKeys.memories(conversationId) });

  const create = useMutation({
    mutationFn: (input) => createAiMemory(conversationId, input),
    onSuccess: invalidateMemories,
  });
  const update = useMutation({
    mutationFn: ({ memoryId, input }) => updateAiMemory(memoryId, input),
    onSuccess: invalidateMemories,
  });
  const remove = useMutation({
    mutationFn: (memoryId) => deleteAiMemory(memoryId),
    onSuccess: invalidateMemories,
  });
  const removeAll = useMutation({
    mutationFn: () => deleteAllAiMemories(conversationId),
    onSuccess: invalidateMemories,
  });
  const setMode = useMutation({
    mutationFn: (mode) => setAiMemoryMode(conversationId, mode),
    onSuccess: (settings) =>
      queryClient.setQueryData(aiKeys.memorySettings(conversationId), settings),
  });

  return { create, update, remove, removeAll, setMode };
}
