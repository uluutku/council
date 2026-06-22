import { messagingKeys } from '../../../lib/query-keys/messaging.js';

// Targeted cache update for the inbox list. Used when the local client advances
// its own read/delivered state so the unread badge clears without a refetch.
// Ordering is never changed here — only the caller's own receipt fields.
export function patchConversationReceipt(queryClient, conversationId, receipt) {
  queryClient.setQueryData(messagingKeys.conversations(), (data) => {
    if (!data?.pages) return data;

    let changed = false;
    const pages = data.pages.map((page) =>
      page.map((conversation) => {
        if (conversation.conversation_id !== conversationId) return conversation;

        const lastReadSequence = Math.max(
          conversation.last_read_sequence,
          receipt.last_read_sequence ?? 0,
        );
        const lastDeliveredSequence = Math.max(
          conversation.last_delivered_sequence,
          receipt.last_delivered_sequence ?? 0,
        );
        if (
          lastReadSequence === conversation.last_read_sequence &&
          lastDeliveredSequence === conversation.last_delivered_sequence
        ) {
          return conversation;
        }

        changed = true;
        return {
          ...conversation,
          last_read_sequence: lastReadSequence,
          last_delivered_sequence: lastDeliveredSequence,
          unread_count: Math.max(conversation.last_message_sequence - lastReadSequence, 0),
        };
      }),
    );

    return changed ? { ...data, pages } : data;
  });
}
