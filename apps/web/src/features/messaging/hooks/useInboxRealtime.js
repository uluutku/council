import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../app/providers/AuthContext.js';
import { contactKeys } from '../../../lib/query-keys/contacts.js';
import { messagingKeys } from '../../../lib/query-keys/messaging.js';
import { subscribeToInboxEvents } from '../realtime/inboxSubscription.js';

// App-level inbox subscription. Validated events only ever invalidate the
// conversation list (and, for availability changes, the affected conversation's
// messages and the contact list). The database remains authoritative; realtime
// is a hint that triggers reconciliation. Payloads are never logged.
export function useInboxRealtime() {
  const { user, client } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    if (!userId || !client) return undefined;

    let active = true;
    let subscription = null;

    const reconcileInbox = () =>
      queryClient.invalidateQueries({ queryKey: messagingKeys.conversations() });

    function handleEvent(event) {
      if (!active) return;

      // Every inbox event can change conversation ordering or preview.
      reconcileInbox();

      if (event.event === 'messaging.availability_changed') {
        // Availability can flip can_send and the contact relationship; refresh
        // both without inferring the cause.
        queryClient.invalidateQueries({ queryKey: contactKeys.list() });
        queryClient.invalidateQueries({
          queryKey: messagingKeys.messages(event.conversation_id),
        });
      }
    }

    function handleStatus(nextStatus) {
      if (!active) return;
      setStatus(nextStatus);
      // A fresh subscription confirmation may follow a disconnect; reconcile so
      // anything missed while disconnected is pulled from the database.
      if (nextStatus === 'subscribed') {
        reconcileInbox();
      }
    }

    try {
      subscription = subscribeToInboxEvents({
        supabase: client,
        userId,
        onEvent: handleEvent,
        onStatus: handleStatus,
        onError: () => {},
      });
    } catch {
      // Subscription failures degrade to focus/visibility reconciliation.
    }

    function reconcileOnResume() {
      if (document.visibilityState === 'visible') reconcileInbox();
    }

    window.addEventListener('focus', reconcileOnResume);
    document.addEventListener('visibilitychange', reconcileOnResume);

    return () => {
      active = false;
      window.removeEventListener('focus', reconcileOnResume);
      document.removeEventListener('visibilitychange', reconcileOnResume);
      subscription?.unsubscribe();
    };
  }, [userId, client, queryClient]);

  return { status };
}
