import {
  aiAccessSchema,
  aiAgentListSchema,
  aiConversationListSchema,
  aiConversationSchema,
  aiMessageListSchema,
  aiPersonaInputSchema,
  aiPersonaListSchema,
  aiPersonaSchema,
} from '@council/schemas';
import { getSupabaseClient } from '../../../lib/supabase.js';
import { toAiApiError } from './aiErrors.js';

// Read/management AI RPC wrappers. Every wrapper validates the returned shape
// with the shared contracts before it reaches a component. The private prompt,
// provider credentials, and run metadata are never part of these contracts.

export async function listAiAgents(client = getSupabaseClient()) {
  const { data, error } = await client.rpc('list_ai_agents');
  if (error) throw toAiApiError(error);
  return aiAgentListSchema.parse(data ?? []);
}

// target is either { agentId } (built-in) or { personaId } (custom).
export async function getOrCreateAiConversation(
  { agentId = null, personaId = null },
  client = getSupabaseClient(),
) {
  const { data, error } = await client
    .rpc('get_or_create_ai_conversation', {
      p_agent_id: agentId,
      p_persona_id: personaId,
    })
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

export async function listMyCustomPersonas(client = getSupabaseClient()) {
  const { data, error } = await client.rpc('list_my_custom_personas');
  if (error) throw toAiApiError(error);
  return aiPersonaListSchema.parse(data ?? []);
}

export async function createCustomPersona(input, client = getSupabaseClient()) {
  const parsed = aiPersonaInputSchema.parse(input);
  const { data, error } = await client
    .rpc('create_custom_persona', {
      p_name: parsed.name,
      p_description: parsed.description,
      p_instructions: parsed.instructions,
      p_tone: parsed.tone,
      p_verbosity: parsed.verbosity,
    })
    .single();
  if (error) throw toAiApiError(error);
  return aiPersonaSchema.parse(data);
}

export async function updateCustomPersona(personaId, input, client = getSupabaseClient()) {
  const parsed = aiPersonaInputSchema.parse(input);
  const { data, error } = await client
    .rpc('update_custom_persona', {
      p_persona_id: personaId,
      p_name: parsed.name,
      p_description: parsed.description,
      p_instructions: parsed.instructions,
      p_tone: parsed.tone,
      p_verbosity: parsed.verbosity,
    })
    .single();
  if (error) throw toAiApiError(error);
  return aiPersonaSchema.parse(data);
}

export async function archiveCustomPersona(personaId, client = getSupabaseClient()) {
  const { error } = await client.rpc('archive_custom_persona', { p_persona_id: personaId });
  if (error) throw toAiApiError(error);
  return true;
}

export async function restoreCustomPersona(personaId, client = getSupabaseClient()) {
  const { error } = await client.rpc('restore_custom_persona', { p_persona_id: personaId });
  if (error) throw toAiApiError(error);
  return true;
}
