import { realtimeUuidSchema } from '@council/schemas';

export function conversationRealtimeTopic(conversationId) {
  return `conversation:${realtimeUuidSchema.parse(conversationId)}`;
}

export function userInboxRealtimeTopic(userId) {
  return `user:${realtimeUuidSchema.parse(userId)}:inbox`;
}

export function conversationEphemeralTopic(conversationId) {
  return `conversation:${realtimeUuidSchema.parse(conversationId)}:ephemeral`;
}
