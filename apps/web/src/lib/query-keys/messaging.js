export const messagingKeys = {
  all: ['messaging'],
  conversations: () => [...messagingKeys.all, 'conversations'],
  conversationPage: (cursor) => [...messagingKeys.conversations(), cursor],
  messages: (conversationId) => [...messagingKeys.all, 'messages', conversationId],
  messagePage: (conversationId, beforeSequence) => [
    ...messagingKeys.messages(conversationId),
    beforeSequence,
  ],
};
