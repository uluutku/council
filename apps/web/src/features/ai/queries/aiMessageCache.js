import { aiKeys } from '../../../lib/query-keys/ai.js';

// Merges messages into the cached list, de-duplicating by id and by user-message
// client id so a synthesized optimistic message and its authoritative row never
// both appear. A background refetch later replaces the list with the truth.
export function appendAiMessages(queryClient, conversationId, incoming) {
  queryClient.setQueryData(aiKeys.messages(conversationId), (current) => {
    const isInfinite = Array.isArray(current?.pages);
    const base = isInfinite ? (current.pages[0] ?? []) : Array.isArray(current) ? current : [];
    const byId = new Map(base.map((message) => [message.id, message]));
    const userClientIds = new Set(
      base.filter((message) => message.role === 'user').map((message) => message.client_message_id),
    );
    for (const message of incoming) {
      if (byId.has(message.id)) continue;
      if (message.role === 'user' && userClientIds.has(message.client_message_id)) continue;
      byId.set(message.id, message);
    }
    const merged = [...byId.values()].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
    if (!isInfinite) return merged;
    return {
      ...current,
      pages: [merged, ...current.pages.slice(1)],
    };
  });
}

// Patches the cached access credits for instant feedback after a generation.
export function setAiAccessCredits(queryClient, creditsRemaining) {
  if (typeof creditsRemaining !== 'number') return;
  queryClient.setQueryData(aiKeys.access(), (current) =>
    current
      ? current.active_credit_source === 'premium'
        ? { ...current, pro_credits_remaining: creditsRemaining }
        : { ...current, trial_credits_remaining: creditsRemaining }
      : current,
  );
}
