import { messagingKeys } from '../../../lib/query-keys/messaging.js';
import { listMyConversations } from '../api/messagingApi.js';

// The inbox is a keyset-paginated infinite query ordered by (updated_at, id)
// descending, exactly as `list_my_conversations` returns it. We never reorder
// locally from realtime arrival alone; realtime only triggers a refetch.

export const CONVERSATION_PAGE_LIMIT = 30;

function cursorFromConversation(conversation) {
  return {
    result_limit: CONVERSATION_PAGE_LIMIT,
    cursor_updated_at: conversation.updated_at,
    cursor_id: conversation.conversation_id,
  };
}

export function conversationsInfiniteQueryOptions() {
  return {
    queryKey: messagingKeys.conversations(),
    queryFn: ({ pageParam }) =>
      listMyConversations(pageParam ?? { result_limit: CONVERSATION_PAGE_LIMIT }),
    initialPageParam: { result_limit: CONVERSATION_PAGE_LIMIT },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < CONVERSATION_PAGE_LIMIT) return undefined;
      return cursorFromConversation(lastPage[lastPage.length - 1]);
    },
  };
}

// Flattens infinite-query pages into one ordered, de-duplicated conversation
// list. Duplicates can appear across page boundaries when updated_at shifts
// between fetches; the first (newest) occurrence wins and order is preserved.
export function flattenConversationPages(data) {
  if (!data?.pages) return [];

  const seen = new Set();
  const conversations = [];
  for (const page of data.pages) {
    for (const conversation of page) {
      if (seen.has(conversation.conversation_id)) continue;
      seen.add(conversation.conversation_id);
      conversations.push(conversation);
    }
  }

  return conversations;
}

export function findConversationInData(data, conversationId) {
  if (!data?.pages) return null;
  for (const page of data.pages) {
    const match = page.find((conversation) => conversation.conversation_id === conversationId);
    if (match) return match;
  }
  return null;
}

// Total unread across all loaded conversations. Bounded by what the inbox has
// paged in, which is the same set the badge and list render.
export function totalUnread(data) {
  return flattenConversationPages(data).reduce(
    (total, conversation) => total + (conversation.unread_count ?? 0),
    0,
  );
}
