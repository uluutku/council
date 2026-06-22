import { aiKeys } from '../../../lib/query-keys/ai.js';
import {
  getMyAiAccess,
  listAiAgents,
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
