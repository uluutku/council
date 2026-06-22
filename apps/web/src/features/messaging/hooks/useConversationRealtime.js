import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../app/providers/AuthContext.js';
import { contactKeys } from '../../../lib/query-keys/contacts.js';
import { messagingKeys } from '../../../lib/query-keys/messaging.js';
import { subscribeToConversationEvents } from '../realtime/conversationSubscription.js';
import { assessRealtimeSequence } from '../realtime/reconciliation.js';
import { flattenMessagePages, highestLoadedSequence } from '../utils/messageList.js';
import { getCachedMessage } from '../queries/messageCache.js';
import { evictAttachmentUrls } from '../queries/attachmentUrlCache.js';

// Subscribes to a single conversation's private topic. Validated events trigger
// targeted reconciliation against the database (the authoritative source);
// malformed events are dropped by the transport layer before they reach here.
// Message content is never read from the payload, and payloads are never logged.
export function useConversationRealtime({
  conversationId,
  currentUserId,
  onPeerReceipt,
  onAvailabilityChange,
}) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('connecting');

  // Keep the latest callbacks without resubscribing when they change identity.
  const onPeerReceiptRef = useRef(onPeerReceipt);
  const onAvailabilityChangeRef = useRef(onAvailabilityChange);
  useEffect(() => {
    onPeerReceiptRef.current = onPeerReceipt;
    onAvailabilityChangeRef.current = onAvailabilityChange;
  });

  useEffect(() => {
    if (!conversationId || !client) return undefined;

    let active = true;
    let subscription = null;

    const messagesKey = messagingKeys.messages(conversationId);

    const reconcileMessages = () => queryClient.invalidateQueries({ queryKey: messagesKey });

    function knownLastSequence() {
      const data = queryClient.getQueryData(messagesKey);
      const messages = flattenMessagePages(data?.pages);
      return messages.length === 0 ? null : highestLoadedSequence(messages);
    }

    function handleEvent(event) {
      if (!active || event.conversation_id !== conversationId) return;

      switch (event.event) {
        case 'message.deleted': {
          // Drop signed URLs for the deleted message's attachments before the
          // reconcile pulls the content/attachment-free tombstone.
          const cached = getCachedMessage(queryClient, conversationId, event.entity_id);
          evictAttachmentUrls((cached?.attachments ?? []).map((attachment) => attachment.id));
          assessRealtimeSequence({
            knownLastSequence: knownLastSequence(),
            eventSequence: event.sequence,
          });
          reconcileMessages();
          break;
        }
        case 'message.created':
        case 'message.edited': {
          // Gap assessment decides whether a simple reconcile suffices; either
          // way we refetch the loaded window from the database to converge.
          assessRealtimeSequence({
            knownLastSequence: knownLastSequence(),
            eventSequence: event.sequence,
          });
          reconcileMessages();
          break;
        }
        case 'reaction.changed': {
          reconcileMessages();
          break;
        }
        case 'receipt.changed': {
          // Only the peer's receipts tell us about our own outgoing messages.
          if (event.actor_user_id !== currentUserId) {
            onPeerReceiptRef.current?.({
              readSequence: event.read_sequence,
              deliveredSequence: event.delivered_sequence,
            });
          }
          break;
        }
        case 'messaging.availability_changed': {
          queryClient.invalidateQueries({ queryKey: messagingKeys.conversations() });
          queryClient.invalidateQueries({ queryKey: contactKeys.list() });
          onAvailabilityChangeRef.current?.();
          break;
        }
        default:
          break;
      }
    }

    function handleStatus(nextStatus) {
      if (!active) return;
      setStatus(nextStatus);
      // On (re)subscribe, reconcile the message window so anything missed while
      // disconnected is pulled from the database.
      if (nextStatus === 'subscribed') {
        reconcileMessages();
      }
    }

    try {
      subscription = subscribeToConversationEvents({
        supabase: client,
        conversationId,
        onEvent: handleEvent,
        onStatus: handleStatus,
        onError: () => {},
      });
    } catch {
      // Subscription failures degrade to focus/visibility reconciliation.
    }

    function reconcileOnResume() {
      if (document.visibilityState === 'visible') reconcileMessages();
    }

    window.addEventListener('focus', reconcileOnResume);
    document.addEventListener('visibilitychange', reconcileOnResume);

    return () => {
      active = false;
      window.removeEventListener('focus', reconcileOnResume);
      document.removeEventListener('visibilitychange', reconcileOnResume);
      subscription?.unsubscribe();
    };
    // onPeerReceipt/onAvailabilityChange are read through stable refs of the
    // caller; conversationId + client + currentUserId drive (re)subscription.
  }, [conversationId, client, queryClient, currentUserId]);

  return { status };
}
