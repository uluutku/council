import { aiKeys } from '../../../lib/query-keys/ai.js';
import {
  getMyAiAccess,
  getAiMemorySettings,
  getAiProviderMetadata,
  listAiAgents,
  listAiMemories,
  listAiMessages,
  listMyAiConversations,
  listMyCustomPersonas,
} from '../api/aiApi.js';

export function aiAgentsQueryOptions() {
  return { queryKey: aiKeys.agents(), queryFn: () => listAiAgents() };
}

export function aiAccessQueryOptions() {
  return { queryKey: aiKeys.access(), queryFn: () => getMyAiAccess() };
}

export function aiConversationsQueryOptions() {
  return { queryKey: aiKeys.conversations(), queryFn: () => listMyAiConversations() };
}

export function aiPersonasQueryOptions() {
  return { queryKey: aiKeys.personas(), queryFn: () => listMyCustomPersonas() };
}

export function aiMessagesQueryOptions(conversationId) {
  return {
    queryKey: aiKeys.messages(conversationId),
    queryFn: () => listAiMessages(conversationId),
    enabled: Boolean(conversationId),
  };
}

export function aiProviderQueryOptions() {
  return {
    queryKey: aiKeys.provider(),
    queryFn: () => getAiProviderMetadata(),
    staleTime: 30_000,
    retry: 1,
  };
}

export function aiMemorySettingsQueryOptions(conversationId) {
  return {
    queryKey: aiKeys.memorySettings(conversationId),
    queryFn: () => getAiMemorySettings(conversationId),
    enabled: Boolean(conversationId),
  };
}

export function aiMemoriesQueryOptions(conversationId) {
  return {
    queryKey: aiKeys.memories(conversationId),
    queryFn: () => listAiMemories(conversationId),
    enabled: Boolean(conversationId),
  };
}
