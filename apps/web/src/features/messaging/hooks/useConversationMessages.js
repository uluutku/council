import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { messagesInfiniteQueryOptions } from '../queries/messagesQuery.js';
import { flattenMessagePages } from '../utils/messageList.js';

// Owns the per-conversation message history infinite query and exposes the
// flattened, ascending, de-duplicated message list. "Next page" loads older
// messages; the newest page loads first.
export function useConversationMessages(conversationId) {
  const query = useInfiniteQuery(messagesInfiniteQueryOptions(conversationId));
  const messages = useMemo(() => flattenMessagePages(query.data?.pages), [query.data]);

  return {
    query,
    messages,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    // Older messages.
    hasOlder: query.hasNextPage,
    isFetchingOlder: query.isFetchingNextPage,
    fetchOlder: query.fetchNextPage,
    refetch: query.refetch,
  };
}
