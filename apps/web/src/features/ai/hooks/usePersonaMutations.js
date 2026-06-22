import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aiKeys } from '../../../lib/query-keys/ai.js';
import {
  archiveCustomPersona,
  createCustomPersona,
  restoreCustomPersona,
  updateCustomPersona,
} from '../api/aiApi.js';

// Create/update/archive/restore mutations for private custom personas. Each
// invalidates the personas list and the conversation list (an archived persona
// changes how its conversation renders).
export function usePersonaMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: aiKeys.personas() });
    queryClient.invalidateQueries({ queryKey: aiKeys.conversations() });
  };

  const create = useMutation({
    mutationFn: (input) => createCustomPersona(input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ personaId, input }) => updateCustomPersona(personaId, input),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: (personaId) => archiveCustomPersona(personaId),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (personaId) => restoreCustomPersona(personaId),
    onSuccess: invalidate,
  });

  return { create, update, archive, restore };
}
