import { messagingKeys } from '../../../lib/query-keys/messaging.js';
import { listConversationMessages } from '../api/messagingApi.js';
import { olderCursor } from '../utils/messageList.js';

// Per-conversation message history is an infinite query. The first page is the
// newest `MESSAGE_PAGE_LIMIT` messages; each subsequent page is the next older
// window addressed by an exclusive `before_sequence` cursor.

export const MESSAGE_PAGE_LIMIT = 50;

export function messagesInfiniteQueryOptions(conversationId) {
  return {
    queryKey: messagingKeys.messages(conversationId),
    queryFn: ({ pageParam }) =>
      listConversationMessages({
        conversation_id: conversationId,
        before_sequence: pageParam ?? null,
        result_limit: MESSAGE_PAGE_LIMIT,
      }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => olderCursor(lastPage, MESSAGE_PAGE_LIMIT),
    enabled: Boolean(conversationId),
  };
}
