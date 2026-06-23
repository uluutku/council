import { useEffect } from 'react';
import { useAuth } from '../../../app/providers/AuthContext.js';
import { markMyPresenceOffline, touchMyPresence } from '../api/messagingApi.js';

const HEARTBEAT_MS = 60_000;

export function usePresenceHeartbeat() {
  const { user, client } = useAuth();

  useEffect(() => {
    if (!user || !client) return undefined;
    let timer = null;

    const stopTimer = () => {
      if (timer) window.clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stopTimer();
      if (document.visibilityState !== 'visible') return;
      touchMyPresence(client).catch(() => {});
      timer = window.setInterval(() => touchMyPresence(client).catch(() => {}), HEARTBEAT_MS);
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') start();
      else {
        stopTimer();
        markMyPresenceOffline(client).catch(() => {});
      }
    };

    start();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stopTimer();
      document.removeEventListener('visibilitychange', visibility);
      markMyPresenceOffline(client).catch(() => {});
    };
  }, [user, client]);
}
