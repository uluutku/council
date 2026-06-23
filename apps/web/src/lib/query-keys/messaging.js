// Stable query-key factory for messaging. Conversations and per-conversation
// messages are TanStack infinite queries, so each owns a single base key whose
// pages are managed by the query cache. Cache update helpers
// (features/messaging/queries) target these keys directly so an event never
// triggers a broad invalidation when a precise update is reliable.
export const messagingKeys = {
  all: ['messaging'],
  conversations: () => [...messagingKeys.all, 'conversations'],
  messages: (conversationId) => [...messagingKeys.all, 'messages', conversationId],
  presence: (userIds) => [...messagingKeys.all, 'presence', ...userIds],
  search: (query) => [...messagingKeys.all, 'search', query],
};
