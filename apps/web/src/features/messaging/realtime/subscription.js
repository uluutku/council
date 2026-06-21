import { realtimeEventEnvelopeSchema } from '@council/schemas';
import { RealtimeSubscriptionError, normalizeRealtimeStatus } from './realtimeErrors.js';

export async function subscribeToPrivateEvents({
  supabase,
  topic,
  eventNames,
  onEvent,
  onStatus = () => {},
  onError = () => {},
}) {
  onStatus('connecting');

  try {
    await supabase.realtime.setAuth();
  } catch (error) {
    const normalized = new RealtimeSubscriptionError('authentication_failed', error);
    onError(normalized);
    throw normalized;
  }

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
