import { useQuery } from '@tanstack/react-query';
import { messagingKeys } from '../../../lib/query-keys/messaging.js';
import { getPresenceForUsers } from '../api/messagingApi.js';

export function usePresence(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))].sort();
  const query = useQuery({
    queryKey: messagingKeys.presence(ids),
    queryFn: () => getPresenceForUsers(ids),
    enabled: ids.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  return new Map((query.data ?? []).map((presence) => [presence.user_id, presence]));
}
