import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../app/providers/AuthContext.js';
import { contactKeys } from '../../../lib/query-keys/contacts.js';
import { messagingKeys } from '../../../lib/query-keys/messaging.js';
import { subscribeToInboxEvents } from '../realtime/inboxSubscription.js';
import { useLocation, useNavigate } from 'react-router-dom';
import { getMessageWindow, listMyConversations } from '../api/messagingApi.js';
import { conversationPeer, peerName } from '../utils/peer.js';
import {
  notificationBody,
  playNotificationSound,
  shouldNotifyMessage,
} from '../notifications/browserNotifications.js';

// App-level inbox subscription. Validated events only ever invalidate the
// conversation list (and, for availability changes, the affected conversation's
// messages and the contact list). The database remains authoritative; realtime
// is a hint that triggers reconciliation. Payloads are never logged.
export function useInboxRealtime() {
  const { user, client, settings } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
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
      if (event.event === 'message.incoming') {
        void (async () => {
          const preferences = settings?.notification_preferences ?? {};
          const permission =
            typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
          const activeMatch = /^\/app\/messages\/([0-9a-f-]{36})$/i.exec(location.pathname);
          const summaries = await listMyConversations({ result_limit: 50 }, client);
          const summary = summaries.find((item) => item.conversation_id === event.conversation_id);
          if (
            !shouldNotifyMessage({
              messageId: event.entity_id,
              senderId: event.actor_user_id,
              currentUserId: userId,
              conversationId: event.conversation_id,
              activeConversationId: activeMatch?.[1] ?? null,
              pageVisible: document.visibilityState === 'visible',
              muted: summary?.is_muted ?? false,
              enabled: preferences.message_notifications ?? true,
              permission,
            })
          ) {
            return;
          }
          const windowMessages = await getMessageWindow(
            event.conversation_id,
            event.entity_id,
            client,
          );
          const message = windowMessages.find((item) => item.id === event.entity_id);
          const peer = conversationPeer(summary);
          const notification = new Notification(peerName(peer), {
            body: notificationBody(message, preferences.message_previews ?? false),
            tag: `message:${event.entity_id}`,
          });
          notification.onclick = () => {
            window.focus();
            navigate(`/app/messages/${event.conversation_id}`);
            notification.close();
          };
          if (preferences.sound ?? true) playNotificationSound();
        })().catch(() => {});
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
  }, [userId, client, queryClient, settings, location.pathname, navigate]);

  return { status };
}
