import { useQuery } from '@tanstack/react-query';
import { contactRequestsQueryOptions } from '../queries/contactQueries.js';
import { pendingIncomingCount } from '../utils/contactRequests.js';

// Derives the pending incoming-request count from the shared requests query so
// the navigation badge and the requests page stay in sync without polling.
export function usePendingRequestCount() {
  const { data } = useQuery(contactRequestsQueryOptions());
  return pendingIncomingCount(data ?? []);
}
