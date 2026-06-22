import { useEffect, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  conversationsInfiniteQueryOptions,
  findConversationInData,
} from '../queries/conversationsQuery.js';

// Locates a single conversation's summary (peer identity, can_send, receipts)
// within the shared inbox infinite query. When a conversation is opened by URL
// and is not on the loaded pages, this pages through the bounded inbox list
// until it is found or the list is exhausted. Shares the inbox query key, so it
// never issues a second competing request.
export function useConversationSummary(conversationId) {
  const query = useInfiniteQuery(conversationsInfiniteQueryOptions());
  const summary = useMemo(
    () => findConversationInData(query.data, conversationId),
    [query.data, conversationId],
  );

  useEffect(() => {
    if (!conversationId || summary) return;
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [conversationId, summary, query.hasNextPage, query.isFetchingNextPage, query]);

  const isResolving = query.isPending || (!summary && query.hasNextPage);

  return {
    summary,
    isResolving,
    isError: query.isError,
    refetch: query.refetch,
  };
}
