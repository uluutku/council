import { realtimeEventEnvelopeSchema } from '@council/schemas';
import { RealtimeSubscriptionError, normalizeRealtimeStatus } from './realtimeErrors.js';

// Subscribes to a private Broadcast topic. The channel is created and torn down
// synchronously so that, under React StrictMode's mount/unmount/mount cycle, a
// previous channel is fully removed before a new one joins the same topic —
// otherwise two concurrent joins to one private topic leave the subscription
// stuck. Auth is refreshed without blocking channel creation; the client already
// carries the session token from sign-in, and setAuth() updates the join payload.
export function subscribeToPrivateEvents({
  supabase,
  topic,
  eventNames,
  onEvent,
  onStatus = () => {},
  onError = () => {},
}) {
  onStatus('connecting');

  const channel = supabase.channel(topic, {
    config: { private: true },
  });

  const handlePayload = (transportEvent) => {
    const result = realtimeEventEnvelopeSchema.safeParse(transportEvent?.payload ?? transportEvent);

    if (!result.success) {
      onError(new RealtimeSubscriptionError('invalid_event', result.error));
      return;
    }

    onEvent(result.data);
  };

  for (const eventName of eventNames) {
    channel.on('broadcast', { event: eventName }, handlePayload);
  }

  // Refresh the realtime auth token for private-topic authorization without
  // awaiting, so teardown stays synchronous.
  Promise.resolve(supabase.realtime.setAuth()).catch((error) => {
    onError(new RealtimeSubscriptionError('authentication_failed', error));
  });

  channel.subscribe((providerStatus, error) => {
    const status = normalizeRealtimeStatus(providerStatus);
    onStatus(status);

    if (status === 'channel_error' || status === 'timed_out') {
      onError(new RealtimeSubscriptionError(status, error));
      onStatus('reconnecting');
    }
  });

  let cleanedUp = false;
  return {
    channel,
    async unsubscribe() {
      if (cleanedUp) return;
      cleanedUp = true;
      await supabase.removeChannel(channel);
    },
  };
}
