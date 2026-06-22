// Memory-only signed-URL cache, keyed by attachment ID. URLs are short-lived and
// must never be persisted, logged, or placed in Realtime payloads. Entries
// expire before the server-side URL does, are evicted when a message is deleted,
// and are cleared entirely on sign-out.

const cache = new Map();

// Refresh a little before the server URL actually expires to avoid a request
// that lands just as the token lapses.
const EXPIRY_SKEW_MS = 60 * 1000;

export function getCachedAttachmentUrl(attachmentId) {
  const entry = cache.get(attachmentId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(attachmentId);
    return null;
  }
  return entry.url;
}

export function setCachedAttachmentUrl(attachmentId, url, expiresInSeconds) {
  const ttlMs = Math.max(expiresInSeconds * 1000 - EXPIRY_SKEW_MS, 0);
  cache.set(attachmentId, { url, expiresAt: Date.now() + ttlMs });
}

export function evictAttachmentUrls(attachmentIds) {
  for (const id of attachmentIds) cache.delete(id);
}

export function clearAttachmentUrlCache() {
  cache.clear();
}
