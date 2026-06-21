import { useMutation, useQueryClient } from '@tanstack/react-query';
import { contactKeys } from '../../../lib/query-keys/contacts.js';
import { useAuth } from '../../../app/providers/AuthContext.js';
import {
  blockUser,
  removeContact,
  respondContactRequest,
  sendContactRequest,
  unblockUser,
} from '../api/contactsApi.js';

const SEARCH_PREFIX = [...contactKeys.all, 'search'];

// Prefer correct invalidation over optimistic updates: every mutation refreshes
// exactly the buckets the database contract can change.
function invalidate(queryClient, buckets) {
  return Promise.all(buckets.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useSendContactRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ targetUserId, knownContact = false }) =>
      sendContactRequest(targetUserId, { actingUserId: user?.id ?? null, knownContact }),
    onSuccess: () =>
      invalidate(queryClient, [contactKeys.requests(), contactKeys.list(), SEARCH_PREFIX]),
  });
}

export function useRespondContactRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ relationshipId, response }) => respondContactRequest(relationshipId, response),
    onSuccess: () =>
      invalidate(queryClient, [contactKeys.requests(), contactKeys.list(), SEARCH_PREFIX]),
  });
}

export function useRemoveContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetUserId }) => removeContact(targetUserId),
    onSuccess: () =>
      invalidate(queryClient, [contactKeys.list(), contactKeys.requests(), SEARCH_PREFIX]),
  });
}

export function useBlockUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetUserId }) => blockUser(targetUserId),
    onSuccess: () =>
      invalidate(queryClient, [
        contactKeys.list(),
        contactKeys.requests(),
        contactKeys.blocked(),
        SEARCH_PREFIX,
      ]),
  });
}

export function useUnblockUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetUserId }) => unblockUser(targetUserId),
    onSuccess: () => invalidate(queryClient, [contactKeys.blocked(), SEARCH_PREFIX]),
  });
}
