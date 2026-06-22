const cache = new Map();
const SKEW_MS = 60_000;

function key(conversationId, attachmentId) {
  return `${conversationId}:${attachmentId}`;
}

export function getCachedAiImageUrl(conversationId, attachmentId) {
  const cacheKey = key(conversationId, attachmentId);
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return null;
  }
  return entry.url;
}

export function setCachedAiImageUrl(conversationId, attachmentId, url, expiresInSeconds) {
  cache.set(key(conversationId, attachmentId), {
    url,
    expiresAt: Date.now() + Math.max(expiresInSeconds * 1000 - SKEW_MS, 0),
  });
}

export function clearAiImageUrlCache() {
  cache.clear();
}
