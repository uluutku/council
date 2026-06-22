export const aiKeys = {
  all: ['ai'],
  agents: () => [...aiKeys.all, 'agents'],
  personas: () => [...aiKeys.all, 'personas'],
  access: () => [...aiKeys.all, 'access'],
  conversations: () => [...aiKeys.all, 'conversations'],
  messages: (conversationId) => [...aiKeys.all, 'messages', conversationId],
  provider: () => [...aiKeys.all, 'provider'],
  memorySettings: (conversationId) => [...aiKeys.all, 'memory-settings', conversationId],
  memories: (conversationId) => [...aiKeys.all, 'memories', conversationId],
};
