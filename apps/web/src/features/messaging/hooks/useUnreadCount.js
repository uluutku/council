import { useInfiniteQuery } from '@tanstack/react-query';
import { conversationsInfiniteQueryOptions, totalUnread } from '../queries/conversationsQuery.js';

// Derives the total unread count from the shared inbox query so the navigation
// badge stays in sync with the conversation list. Mounting this keeps the inbox
// query active, so realtime invalidations and focus reconciliation refresh the
// badge without any additional polling.
export function useUnreadCount() {
  const query = useInfiniteQuery(conversationsInfiniteQueryOptions());
  return totalUnread(query.data);
}
