import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../app/providers/AuthContext.js';
import { subscribeToTyping } from '../realtime/typingSubscription.js';

const EXPIRES_MS = 5_000;
const INACTIVITY_MS = 1_500;
const THROTTLE_MS = 2_000;

export function useTypingIndicator(conversationId) {
  const { client } = useAuth();
  const [peerTyping, setPeerTyping] = useState(false);
  const subscriptionRef = useRef(null);
  const expiryRef = useRef(null);
  const inactivityRef = useRef(null);
  const lastStartRef = useRef(0);
  const textActiveRef = useRef(false);

  const stop = useCallback(() => {
    textActiveRef.current = false;
    if (inactivityRef.current) window.clearTimeout(inactivityRef.current);
    inactivityRef.current = null;
    subscriptionRef.current?.send('typing.stop').catch(() => {});
  }, []);

  const update = useCallback(
    (hasText) => {
      if (!hasText) {
        stop();
        return;
      }
      textActiveRef.current = true;
      const now = Date.now();
      if (now - lastStartRef.current >= THROTTLE_MS) {
        lastStartRef.current = now;
        subscriptionRef.current?.send('typing.start').catch(() => {});
      }
      if (inactivityRef.current) window.clearTimeout(inactivityRef.current);
      inactivityRef.current = window.setTimeout(stop, INACTIVITY_MS);
    },
    [stop],
  );

  useEffect(() => {
    if (!conversationId || !client || typeof client.channel !== 'function') return undefined;
    let subscription;
    try {
      subscription = subscribeToTyping({
        supabase: client,
        conversationId,
        onTyping: (event) => {
          if (expiryRef.current) window.clearTimeout(expiryRef.current);
          if (event.event === 'typing.stop') {
            setPeerTyping(false);
            return;
          }
          setPeerTyping(true);
          expiryRef.current = window.setTimeout(() => setPeerTyping(false), EXPIRES_MS);
        },
        onStatus: (status) => {
          if (status !== 'subscribed' || !textActiveRef.current) return;
          lastStartRef.current = Date.now();
          subscriptionRef.current?.send('typing.start').catch(() => {});
        },
      });
    } catch {
      return undefined;
    }
    subscriptionRef.current = subscription;
    return () => {
      subscription.send('typing.stop').catch(() => {});
      subscription.unsubscribe();
      subscriptionRef.current = null;
      if (expiryRef.current) window.clearTimeout(expiryRef.current);
      if (inactivityRef.current) window.clearTimeout(inactivityRef.current);
    };
  }, [conversationId, client]);

  return { peerTyping, update, stop };
}
