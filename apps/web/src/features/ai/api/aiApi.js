import {
  aiAccessSchema,
  aiAgentListSchema,
  aiConversationListSchema,
  aiConversationSchema,
  aiMessageListSchema,
} from '@council/schemas';
import { getSupabaseClient } from '../../../lib/supabase.js';
import { toAiApiError } from './aiErrors.js';

// Read-only AI RPC wrappers. Every wrapper validates the returned shape with the
// shared contracts before it reaches a component. The private prompt, provider
// credentials, and run metadata are never part of these contracts.

export async function listAiAgents(client = getSupabaseClient()) {
  const { data, error } = await client.rpc('list_ai_agents');
  if (error) throw toAiApiError(error);
  return aiAgentListSchema.parse(data ?? []);
}

export async function getOrCreateAiConversation(agentId, client = getSupabaseClient()) {
  const { data, error } = await client
    .rpc('get_or_create_ai_conversation', { p_agent_id: agentId })
    .single();
  if (error) throw toAiApiError(error);
  return aiConversationSchema.parse(data);
}

export async function listMyAiConversations(client = getSupabaseClient()) {
  const { data, error } = await client.rpc('list_my_ai_conversations', { p_limit: 30 });
  if (error) throw toAiApiError(error);
  return aiConversationListSchema.parse(data ?? []);
}

export async function listAiMessages(conversationId, client = getSupabaseClient()) {
  const { data, error } = await client.rpc('list_ai_messages', {
    p_conversation_id: conversationId,
    p_limit: 200,
  });
  if (error) throw toAiApiError(error);
  return aiMessageListSchema.parse(data ?? []);
}

export async function getMyAiAccess(client = getSupabaseClient()) {
  const { data, error } = await client.rpc('get_my_ai_access').single();
  if (error) throw toAiApiError(error);
  return aiAccessSchema.parse(data);
}
