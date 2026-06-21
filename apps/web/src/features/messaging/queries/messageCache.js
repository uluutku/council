import { messagingKeys } from '../../../lib/query-keys/messaging.js';

// Centralized cache update helpers for per-conversation message history. Every
// mutation and realtime reconciliation funnels through these so messages stay
// de-duplicated by id and deleted content is removed from every cached page.
// Rendering re-sorts by sequence, so these helpers do not need to keep pages
// strictly ordered — only correct and de-duplicated.

function setMessagesData(queryClient, conversationId, updater) {
  queryClient.setQueryData(messagingKeys.messages(conversationId), (data) => {
    if (!data) return data;
    return updater(data);
  });
}

// Inserts a brand-new authoritative message (e.g. confirmed optimistic send),
// replacing any existing row with the same id. No-op if the query is not cached
// yet — the next fetch/refetch will include the row authoritatively.
export function upsertMessage(queryClient, conversationId, message) {
  setMessagesData(queryClient, conversationId, (data) => {
    const pages = data.pages.map((page) => page.filter((entry) => entry.id !== message.id));
    if (pages.length === 0) {
      return { ...data, pages: [[message]] };
    }
    pages[0] = [message, ...pages[0]];
    return { ...data, pages };
  });
}

// Replaces an existing message in place (edit, deletion tombstone, reaction
// refresh) without changing page structure. Deleted tombstones arrive with
// content === null, which clears the previous content from the cache.
export function replaceMessage(queryClient, conversationId, message) {
  setMessagesData(queryClient, conversationId, (data) => ({
    ...data,
    pages: data.pages.map((page) =>
      page.map((entry) => (entry.id === message.id ? message : entry)),
    ),
  }));
}

export function getCachedMessage(queryClient, conversationId, messageId) {
  const data = queryClient.getQueryData(messagingKeys.messages(conversationId));
  if (!data?.pages) return null;
  for (const page of data.pages) {
    const match = page.find((entry) => entry.id === messageId);
    if (match) return match;
  }
  return null;
}

// Removes every messaging query from the cache. Called on sign-out so no private
// message content, preview, or receipt state survives a session change.
export function clearMessagingQueries(queryClient) {
  queryClient.removeQueries({ queryKey: messagingKeys.all });
}
