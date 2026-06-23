import { typingEventSchema } from '@council/schemas';
import { conversationEphemeralTopic } from './topics.js';

export function subscribeToTyping({ supabase, conversationId, onTyping, onStatus = () => {} }) {
  const channel = supabase.channel(conversationEphemeralTopic(conversationId), {
    config: { private: true, broadcast: { self: false } },
  });
  let subscribed = false;
  const handle = (event) => {
    const parsed = typingEventSchema.safeParse(event?.payload ?? event);
    if (parsed.success) onTyping(parsed.data);
  };
  channel.on('broadcast', { event: 'typing.start' }, handle);
  channel.on('broadcast', { event: 'typing.stop' }, handle);
  Promise.resolve(supabase.realtime.setAuth()).catch(() => {});
  channel.subscribe((status) => {
    subscribed = status === 'SUBSCRIBED';
    onStatus(subscribed ? 'subscribed' : 'connecting');
  });

  return {
    send(event) {
      if (!subscribed) return Promise.resolve('not_sent');
      const payload = typingEventSchema.parse({
        version: 1,
        event,
        sent_at: new Date().toISOString(),
      });
      return channel.send({ type: 'broadcast', event, payload });
    },
    unsubscribe() {
      return supabase.removeChannel(channel);
    },
  };
}
