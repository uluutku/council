import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  conversationsInfiniteQueryOptions,
  flattenConversationPages,
} from '../queries/conversationsQuery.js';

// Owns the inbox infinite query and exposes a flattened, de-duplicated list.
// Realtime updates are handled separately (useInboxRealtime) and only ever
// invalidate this query; ordering always comes from the backend.
export function useConversations() {
  const query = useInfiniteQuery(conversationsInfiniteQueryOptions());
  const conversations = useMemo(() => flattenConversationPages(query.data), [query.data]);

  return {
    query,
    conversations,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}
