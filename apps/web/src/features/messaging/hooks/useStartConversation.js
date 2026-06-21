import { useMutation, useQueryClient } from '@tanstack/react-query';
import { messagingKeys } from '../../../lib/query-keys/messaging.js';
import { createOrGetDirectConversation } from '../api/messagingApi.js';

// Opens or creates the single direct conversation with a contact. The backend
// is the sole authority on duplicate prevention (one conversation per pair) and
// on availability; concurrent or repeated calls converge on the same row. The
// mutation's pending state is used by callers to prevent duplicate submissions.
export function useStartConversation() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (targetUserId) => createOrGetDirectConversation(targetUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagingKeys.conversations() });
    },
  });

  return mutation;
}
