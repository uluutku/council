import { useEffect } from 'react';
import { useAuth } from '../../../app/providers/AuthContext.js';
import { markMyPresenceOffline, touchMyPresence } from '../api/messagingApi.js';

const HEARTBEAT_MS = 25_000;

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
    const markOffline = () => {
      stopTimer();
      markMyPresenceOffline(client).catch(() => {});
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') start();
      else {
        markOffline();
      }
    };

    start();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', start);
    window.addEventListener('online', start);
    window.addEventListener('pageshow', start);
    window.addEventListener('pagehide', markOffline);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', start);
      window.removeEventListener('online', start);
      window.removeEventListener('pageshow', start);
      window.removeEventListener('pagehide', markOffline);
      markOffline();
    };
  }, [user, client]);
}
