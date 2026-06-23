import {
  conversationCursorSchema,
  conversationMuteInputSchema,
  conversationMuteSchema,
  conversationMemberReceiptSchema,
  conversationPageResponseSchema,
  conversationSearchResultsSchema,
  createDirectConversationInputSchema,
  deletedMessageSchema,
  directConversationResultSchema,
  editMessageInputSchema,
  messageActionInputSchema,
  messagePageInputSchema,
  messagePageResponseSchema,
  messageSearchInputSchema,
  messageSearchResultsSchema,
  messageSchema,
  presenceListSchema,
  reactionInputSchema,
  reactionSchema,
  receiptUpdateSchema,
  sendMessageInputSchema,
} from '@council/schemas';
import { getSupabaseClient } from '../../../lib/supabase.js';
import { toMessagingApiError } from './messagingErrors.js';

// Messaging RPC boundaries intentionally preserve PostgreSQL snake_case. This
// avoids a second mapping contract before a UI exists and makes request/response
// validation correspond exactly to the documented database functions.

export async function createOrGetDirectConversation(targetUserId, client = getSupabaseClient()) {
  const input = createDirectConversationInputSchema.parse({
    target_user_id: targetUserId,
  });
  const { data, error } = await client.rpc('create_or_get_direct_conversation', input).single();

  if (error) throw toMessagingApiError(error);
  return directConversationResultSchema.parse(data);
}

export async function listMyConversations(cursor = {}, client = getSupabaseClient()) {
  const input = conversationCursorSchema.parse(cursor);
  const { data, error } = await client.rpc('list_my_conversations', input);

  if (error) throw toMessagingApiError(error);
  return conversationPageResponseSchema.parse(data ?? []);
}

export async function listConversationMessages(input, client = getSupabaseClient()) {
  const parsed = messagePageInputSchema.parse(input);
  const { data, error } = await client.rpc('list_conversation_messages', {
    p_conversation_id: parsed.conversation_id,
    p_before_sequence: parsed.before_sequence,
    p_result_limit: parsed.result_limit,
  });

  if (error) throw toMessagingApiError(error);
  return messagePageResponseSchema.parse(data ?? []);
}

export async function sendMessage(input, client = getSupabaseClient()) {
  const parsed = sendMessageInputSchema.parse(input);
  const { data, error } = await client
    .rpc('send_message', {
      p_conversation_id: parsed.conversation_id,
      p_client_message_id: parsed.client_message_id,
      p_content: parsed.content,
      p_reply_to_message_id: parsed.reply_to_message_id,
      p_attachment_ids: parsed.attachment_ids,
    })
    .single();

  if (error) throw toMessagingApiError(error);
  return messageSchema.parse(data);
}

export async function editMessage(input, client = getSupabaseClient()) {
  const parsed = editMessageInputSchema.parse(input);
  const { data, error } = await client
    .rpc('edit_message', {
      p_message_id: parsed.message_id,
      p_content: parsed.content,
    })
    .single();

  if (error) throw toMessagingApiError(error);
  return messageSchema.parse(data);
}

export async function deleteMessage(messageId, client = getSupabaseClient()) {
  const input = messageActionInputSchema.parse({ message_id: messageId });
  const { data, error } = await client
    .rpc('delete_message', { p_message_id: input.message_id })
    .single();

  if (error) throw toMessagingApiError(error);
  return deletedMessageSchema.parse(data);
}

export async function addMessageReaction(input, client = getSupabaseClient()) {
  const parsed = reactionInputSchema.parse(input);
  const { data, error } = await client
    .rpc('add_message_reaction', {
      p_message_id: parsed.message_id,
      p_emoji: parsed.emoji,
    })
    .single();

  if (error) throw toMessagingApiError(error);
  return reactionSchema.parse(data);
}

export async function removeMessageReaction(input, client = getSupabaseClient()) {
  const parsed = reactionInputSchema.parse(input);
  const { data, error } = await client.rpc('remove_message_reaction', {
    p_message_id: parsed.message_id,
    p_emoji: parsed.emoji,
  });

  if (error) throw toMessagingApiError(error);
  return { removed: data === true };
}

async function updateReceipt(rpcName, input, client) {
  const parsed = receiptUpdateSchema.parse(input);
  const { data, error } = await client
    .rpc(rpcName, {
      p_conversation_id: parsed.conversation_id,
      p_through_sequence: parsed.through_sequence,
    })
    .single();

  if (error) throw toMessagingApiError(error);
  return conversationMemberReceiptSchema.parse(data);
}

export async function markConversationDelivered(input, client = getSupabaseClient()) {
  return updateReceipt('mark_conversation_delivered', input, client);
}

export async function markConversationRead(input, client = getSupabaseClient()) {
  return updateReceipt('mark_conversation_read', input, client);
}

export async function setConversationMute(input, client = getSupabaseClient()) {
  const parsed = conversationMuteInputSchema.parse(input);
  const { data, error } = await client
    .rpc('set_conversation_mute', {
      p_conversation_id: parsed.conversation_id,
      p_duration_seconds: parsed.duration_seconds,
      p_forever: parsed.forever,
    })
    .single();
  if (error) throw toMessagingApiError(error);
  return conversationMuteSchema.parse(data);
}

export async function touchMyPresence(client = getSupabaseClient()) {
  const { data, error } = await client.rpc('touch_my_presence');
  if (error) throw toMessagingApiError(error);
  return data;
}

export async function markMyPresenceOffline(client = getSupabaseClient()) {
  const { error } = await client.rpc('mark_my_presence_offline');
  if (error) throw toMessagingApiError(error);
}

export async function getPresenceForUsers(userIds, client = getSupabaseClient()) {
  const ids = [...new Set(userIds)].slice(0, 50);
  if (ids.length === 0) return [];
  const { data, error } = await client.rpc('get_presence_for_users', { p_user_ids: ids });
  if (error) throw toMessagingApiError(error);
  return presenceListSchema.parse(data ?? []);
}

export async function searchMyConversations(query, client = getSupabaseClient()) {
  const parsed = messageSearchInputSchema.parse({ query });
  const { data, error } = await client.rpc('search_my_conversations', {
    p_query: parsed.query,
    p_result_limit: 20,
  });
  if (error) throw toMessagingApiError(error);
  return conversationSearchResultsSchema.parse(data ?? []);
}

export async function searchMyMessages(input, client = getSupabaseClient()) {
  const parsed = messageSearchInputSchema.parse(input);
  const { data, error } = await client.rpc('search_my_messages', {
    p_query: parsed.query,
    p_before_created_at: parsed.before_created_at,
    p_before_id: parsed.before_id,
    p_result_limit: parsed.result_limit,
  });
  if (error) throw toMessagingApiError(error);
  return messageSearchResultsSchema.parse(data ?? []);
}

export async function getMessageWindow(conversationId, messageId, client = getSupabaseClient()) {
  const { data, error } = await client.rpc('get_message_window', {
    p_conversation_id: conversationId,
    p_message_id: messageId,
    p_radius: 25,
  });
  if (error) throw toMessagingApiError(error);
  return messagePageResponseSchema.parse(data ?? []);
}
