import {
  aiAccessSchema,
  aiAgentListSchema,
  aiConversationListSchema,
  aiConversationSchema,
  aiDeletedMemoryCountSchema,
  deletedAiConversationSchema,
  aiMemoryInputSchema,
  aiMemoryListSchema,
  aiMemorySchema,
  aiMemorySettingsSchema,
  aiMessageListSchema,
  aiPersonaInputSchema,
  aiPersonaListSchema,
  aiPersonaSchema,
  aiProviderMetadataSchema,
} from '@council/schemas';
import { readBrowserEnvironment } from '../../../lib/env.js';
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

export async function deleteAiConversation(conversationId, client = getSupabaseClient()) {
  const { data, error } = await client.rpc('delete_ai_conversation', {
    p_conversation_id: conversationId,
  });
  if (error) throw toAiApiError(error);
  return deletedAiConversationSchema.parse(data);
}

export async function listAiMessages(
  conversationId,
  { beforeCreatedAt = null, beforeId = null, limit = 100 } = {},
  client = getSupabaseClient(),
) {
  const { data, error } = await client.rpc('list_ai_messages', {
    p_conversation_id: conversationId,
    p_limit: limit,
    p_before_created_at: beforeCreatedAt,
    p_before_id: beforeId,
  });
  if (error) throw toAiApiError(error);
  return aiMessageListSchema.parse(data ?? []);
}

export async function getMyAiAccess(client = getSupabaseClient()) {
  const { data, error } = await client.rpc('get_my_ai_access').single();
  if (error) throw toAiApiError(error);
  return aiAccessSchema.parse(data);
}

export async function getAiProviderMetadata(fetcher = fetch) {
  const environment = readBrowserEnvironment();
  const client = getSupabaseClient();
  const {
    data: { session },
  } = await client.auth.getSession();
  const response = await fetcher(
    `${environment.supabaseUrl.replace(/\/$/, '')}/functions/v1/ai-chat?details=1`,
    {
      headers: {
        apikey: environment.supabaseAnonKey,
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
    },
  );
  if (!response.ok) throw toAiApiError({ status: response.status });
  return aiProviderMetadataSchema.parse(await response.json());
}

export async function getAiMemorySettings(conversationId, client = getSupabaseClient()) {
  const { data, error } = await client
    .rpc('get_ai_memory_settings', { p_conversation_id: conversationId })
    .single();
  if (error) throw toAiApiError(error);
  return aiMemorySettingsSchema.parse(data);
}

export async function listAiMemories(conversationId, client = getSupabaseClient()) {
  const { data, error } = await client.rpc('list_ai_memories', {
    p_conversation_id: conversationId,
  });
  if (error) throw toAiApiError(error);
  return aiMemoryListSchema.parse(data ?? []);
}

export async function createAiMemory(conversationId, input, client = getSupabaseClient()) {
  const parsed = aiMemoryInputSchema.parse(input);
  const { data, error } = await client
    .rpc('create_ai_memory', {
      p_conversation_id: conversationId,
      p_category: parsed.category,
      p_content: parsed.content,
      p_source_message_id: parsed.source_message_id,
    })
    .single();
  if (error) throw toAiApiError(error);
  return aiMemorySchema.parse(data);
}

export async function updateAiMemory(memoryId, input, client = getSupabaseClient()) {
  const parsed = aiMemoryInputSchema.parse(input);
  const { data, error } = await client
    .rpc('update_ai_memory', {
      p_memory_id: memoryId,
      p_category: parsed.category,
      p_content: parsed.content,
    })
    .single();
  if (error) throw toAiApiError(error);
  return aiMemorySchema.parse(data);
}

export async function deleteAiMemory(memoryId, client = getSupabaseClient()) {
  const { error } = await client.rpc('delete_ai_memory', { p_memory_id: memoryId });
  if (error) throw toAiApiError(error);
  return true;
}

export async function deleteAllAiMemories(conversationId, client = getSupabaseClient()) {
  const { data, error } = await client.rpc('delete_all_ai_memories', {
    p_conversation_id: conversationId,
  });
  if (error) throw toAiApiError(error);
  return aiDeletedMemoryCountSchema.parse(data);
}

export async function setAiMemoryMode(conversationId, memoryMode, client = getSupabaseClient()) {
  const { data, error } = await client
    .rpc('set_ai_memory_mode', {
      p_conversation_id: conversationId,
      p_memory_mode: memoryMode,
    })
    .single();
  if (error) throw toAiApiError(error);
  return aiMemorySettingsSchema.parse(data);
}

export async function listMyCustomPersonas(client = getSupabaseClient()) {
  const { data, error } = await client.rpc('list_my_custom_personas');
  if (error) throw toAiApiError(error);
  return aiPersonaListSchema.parse(data ?? []);
}

function isRpcSignatureMissing(error) {
  const message = String(error?.message ?? '').toLowerCase();
  return (
    error?.code === 'PGRST202' ||
    error?.code === '42883' ||
    (message.includes('function') && message.includes('does not exist')) ||
    message.includes('could not find the function')
  );
}

export async function createCustomPersona(input, client = getSupabaseClient()) {
  const parsed = aiPersonaInputSchema.parse(input);
  const params = {
    p_name: parsed.name,
    p_description: parsed.description,
    p_instructions: parsed.instructions,
    p_tone: parsed.tone,
    p_verbosity: parsed.verbosity,
    p_avatar_path: parsed.avatar_path,
  };
  let result = await client.rpc('create_custom_persona', params).single();

  if (result.error && parsed.avatar_path === null && isRpcSignatureMissing(result.error)) {
    const legacyParams = { ...params };
    delete legacyParams.p_avatar_path;
    result = await client.rpc('create_custom_persona', legacyParams).single();
  }

  const { data, error } = result;
  if (error) throw toAiApiError(error);
  return aiPersonaSchema.parse(data);
}

export async function updateCustomPersona(personaId, input, client = getSupabaseClient()) {
  const parsed = aiPersonaInputSchema.parse(input);
  const params = {
    p_persona_id: personaId,
    p_name: parsed.name,
    p_description: parsed.description,
    p_instructions: parsed.instructions,
    p_tone: parsed.tone,
    p_verbosity: parsed.verbosity,
    p_avatar_path: parsed.avatar_path,
  };
  let result = await client.rpc('update_custom_persona', params).single();

  if (result.error && parsed.avatar_path === null && isRpcSignatureMissing(result.error)) {
    const legacyParams = { ...params };
    delete legacyParams.p_avatar_path;
    result = await client.rpc('update_custom_persona', legacyParams).single();
  }

  const { data, error } = result;
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
