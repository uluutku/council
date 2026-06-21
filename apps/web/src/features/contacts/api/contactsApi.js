import {
  blockedUserListSchema,
  contactActionResultSchema,
  contactListSchema,
  contactRelationshipSchema,
  contactRequestListSchema,
  profileSearchQuerySchema,
  profileSearchResultsSchema,
} from '@council/schemas';
import { getSupabaseClient } from '../../../lib/supabase.js';

// Presentational components never call Supabase directly. These wrappers own the
// RPC names and argument shapes, validate every returned row with the shared
// schemas, and surface raw errors so the calling layer can map them to a stable
// user-facing category. No wrapper accepts a caller-supplied acting identity;
// the database always derives it from auth.uid().

export async function searchProfiles(query, resultLimit = 20, client = getSupabaseClient()) {
  const input = profileSearchQuerySchema.parse({ query, result_limit: resultLimit });
  const { data, error } = await client.rpc('search_profiles', {
    query: input.query,
    result_limit: input.result_limit,
  });

  if (error) throw error;
  return profileSearchResultsSchema.parse(data ?? []);
}

function deriveSendOutcome(relationship, actingUserId, knownContact) {
  if (relationship.status !== 'accepted') {
    return 'request_sent';
  }

  if (knownContact || relationship.requested_by === actingUserId) {
    return 'already_contacts';
  }

  return 'now_contacts';
}

export async function sendContactRequest(
  targetUserId,
  { actingUserId = null, knownContact = false } = {},
  client = getSupabaseClient(),
) {
  const { data, error } = await client
    .rpc('send_contact_request', { target_user_id: targetUserId })
    .single();

  if (error) throw error;

  const relationship = contactRelationshipSchema.parse(data);
  const outcome = deriveSendOutcome(relationship, actingUserId, knownContact);
  return contactActionResultSchema.parse({ outcome, relationship });
}

export async function respondContactRequest(
  relationshipId,
  response,
  client = getSupabaseClient(),
) {
  const { data, error } = await client
    .rpc('respond_contact_request', { relationship_id: relationshipId, response })
    .single();

  if (error) throw error;
  return contactRelationshipSchema.parse(data);
}

export async function removeContact(targetUserId, client = getSupabaseClient()) {
  const { data, error } = await client.rpc('remove_contact', { target_user_id: targetUserId });

  if (error) throw error;
  return { removed: data === true };
}

export async function blockUser(targetUserId, client = getSupabaseClient()) {
  const { data, error } = await client.rpc('block_user', { target_user_id: targetUserId });

  if (error) throw error;
  return { blocked: data === true };
}

export async function unblockUser(targetUserId, client = getSupabaseClient()) {
  const { data, error } = await client.rpc('unblock_user', { target_user_id: targetUserId });

  if (error) throw error;
  return { unblocked: data === true };
}

export async function listMyContacts(client = getSupabaseClient()) {
  const { data, error } = await client.rpc('list_my_contacts');

  if (error) throw error;
  return contactListSchema.parse(data ?? []);
}

export async function listMyContactRequests(client = getSupabaseClient()) {
  const { data, error } = await client.rpc('list_my_contact_requests');

  if (error) throw error;
  return contactRequestListSchema.parse(data ?? []);
}

export async function listMyBlockedUsers(client = getSupabaseClient()) {
  const { data, error } = await client.rpc('list_my_blocked_users');

  if (error) throw error;
  return blockedUserListSchema.parse(data ?? []);
}
