import { contactKeys } from '../../../lib/query-keys/contacts.js';
import {
  listMyBlockedUsers,
  listMyContactRequests,
  listMyContacts,
  searchProfiles,
} from '../api/contactsApi.js';

// Query option factories. TanStack Query owns all contacts server state; these
// keep query keys and fetchers in one place so pages and the request-count
// indicator stay consistent.

export function contactsQueryOptions() {
  return {
    queryKey: contactKeys.list(),
    queryFn: () => listMyContacts(),
  };
}

export function contactRequestsQueryOptions() {
  return {
    queryKey: contactKeys.requests(),
    queryFn: () => listMyContactRequests(),
    // The navigation badge should pick up new requests when the user returns to
    // the tab. No faster polling and no realtime in this task.
    refetchOnWindowFocus: true,
  };
}

export function blockedUsersQueryOptions() {
  return {
    queryKey: contactKeys.blocked(),
    queryFn: () => listMyBlockedUsers(),
  };
}

// Discovery is bounded: the query stays disabled until at least two non-space
// characters are present, so an empty or single-character box never queries.
export function discoverProfilesQueryOptions(query) {
  const trimmed = query.trim();
  return {
    queryKey: contactKeys.search(trimmed),
    queryFn: () => searchProfiles(trimmed),
    enabled: trimmed.length >= 2,
    placeholderData: (previous) => previous,
  };
}
