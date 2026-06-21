import { subscribeToPrivateEvents } from './subscription.js';
import { conversationRealtimeTopic } from './topics.js';

const CONVERSATION_EVENTS = [
  'message.created',
  'message.edited',
  'message.deleted',
  'reaction.changed',
  'receipt.changed',
  'messaging.availability_changed',
];

export function subscribeToConversationEvents({
  supabase,
  conversationId,
  onEvent,
  onStatus,
  onError,
}) {
  return subscribeToPrivateEvents({
    supabase,
    topic: conversationRealtimeTopic(conversationId),
    eventNames: CONVERSATION_EVENTS,
    onEvent,
    onStatus,
    onError,
  });
}
