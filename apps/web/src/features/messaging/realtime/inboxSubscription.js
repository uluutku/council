import { subscribeToPrivateEvents } from './subscription.js';
import { userInboxRealtimeTopic } from './topics.js';

const INBOX_EVENTS = [
  'conversation.created',
  'conversation.changed',
  'message.incoming',
  'messaging.availability_changed',
];

export function subscribeToInboxEvents({ supabase, userId, onEvent, onStatus, onError }) {
  return subscribeToPrivateEvents({
    supabase,
    topic: userInboxRealtimeTopic(userId),
    eventNames: INBOX_EVENTS,
    onEvent,
    onStatus,
    onError,
  });
}
