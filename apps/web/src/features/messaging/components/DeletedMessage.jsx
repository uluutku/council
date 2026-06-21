// Tombstone body for a deleted message. The original content is never shown and
// is not present in the cache after deletion. Replies pointing here remain
// linked, but this message displays only a neutral placeholder.
export function DeletedMessage() {
  return <p className="message-deleted">Message deleted</p>;
}
