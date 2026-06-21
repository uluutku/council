// Message-page helpers. `list_conversation_messages` returns newest-first pages,
// and the infinite query stores the newest page first with progressively older
// pages appended. These helpers flatten those pages into a single ascending,
// de-duplicated list for rendering and derive the cursor for the next older page.

export function flattenMessagePages(pages) {
  if (!pages) return [];

  const byId = new Map();
  for (const page of pages) {
    for (const message of page) {
      // Later pages never contradict earlier ones for the same id, but a refetch
      // can momentarily surface the same row in two pages; keep one entry.
      byId.set(message.id, message);
    }
  }

  return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
}

// The cursor for the next (older) page is the smallest sequence currently loaded.
// Returns null when a page came back short, signalling there is nothing older.
export function olderCursor(lastPage, resultLimit) {
  if (!lastPage || lastPage.length === 0 || lastPage.length < resultLimit) {
    return undefined;
  }

  const oldest = lastPage.reduce(
    (min, message) => (message.sequence < min ? message.sequence : min),
    lastPage[0].sequence,
  );

  return oldest;
}

export function highestLoadedSequence(messages) {
  return messages.reduce((max, message) => (message.sequence > max ? message.sequence : max), 0);
}
