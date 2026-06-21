import {
  conversationCursorSchema,
  conversationMemberReceiptSchema,
  conversationPageResponseSchema,
  createDirectConversationInputSchema,
  deletedMessageSchema,
  directConversationResultSchema,
  editMessageInputSchema,
  messageActionInputSchema,
  messagePageInputSchema,
  messagePageResponseSchema,
  messageSchema,
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
