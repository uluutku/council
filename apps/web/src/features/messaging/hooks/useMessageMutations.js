import { useMutation, useQueryClient } from '@tanstack/react-query';
import { messagingKeys } from '../../../lib/query-keys/messaging.js';
import {
  addMessageReaction,
  deleteMessage,
  editMessage,
  removeMessageReaction,
} from '../api/messagingApi.js';
import { getCachedMessage, replaceMessage } from '../queries/messageCache.js';
import { evictAttachmentUrls } from '../queries/attachmentUrlCache.js';

// Edit, delete, and reaction mutations for one conversation. Edits and deletions
// return the authoritative row, which is written into the cache in place — a
// deletion tombstone arrives with content === null, clearing the previous
// content everywhere it was cached. Reactions reconcile by refetching the
// message window so counts always match the backend's deterministic ordering.
export function useMessageMutations(conversationId) {
  const queryClient = useQueryClient();
  const messagesKey = messagingKeys.messages(conversationId);

  const invalidatePreview = () =>
    queryClient.invalidateQueries({ queryKey: messagingKeys.conversations() });

  const edit = useMutation({
    mutationFn: ({ messageId, content }) => editMessage({ message_id: messageId, content }),
    onSuccess: (message) => {
      replaceMessage(queryClient, conversationId, message);
      invalidatePreview();
    },
  });

  const remove = useMutation({
    mutationFn: ({ messageId }) => deleteMessage(messageId),
    onSuccess: (tombstone) => {
      // Drop any signed URLs the deleted message's attachments produced before
      // the tombstone (with no attachments) replaces it in the cache.
      const previous = getCachedMessage(queryClient, conversationId, tombstone.id);
      evictAttachmentUrls((previous?.attachments ?? []).map((attachment) => attachment.id));
      replaceMessage(queryClient, conversationId, tombstone);
      invalidatePreview();
    },
  });

  const addReaction = useMutation({
    mutationFn: ({ messageId, emoji }) => addMessageReaction({ message_id: messageId, emoji }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: messagesKey }),
  });

  const removeReaction = useMutation({
    mutationFn: ({ messageId, emoji }) => removeMessageReaction({ message_id: messageId, emoji }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: messagesKey }),
  });

  return { edit, remove, addReaction, removeReaction };
}
