const cache = new Map();
const SKEW_MS = 60_000;
const key = (conversationId, documentId) => `${conversationId}:${documentId}`;

export function getCachedAiDocumentUrl(conversationId, documentId) {
  const cacheKey = key(conversationId, documentId);
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return null;
  }
  return entry.url;
}

export function setCachedAiDocumentUrl(conversationId, documentId, url, expiresInSeconds) {
  cache.set(key(conversationId, documentId), {
    url,
    expiresAt: Date.now() + Math.max(expiresInSeconds * 1000 - SKEW_MS, 0),
  });
}

export function clearAiDocumentUrlCache() {
  cache.clear();
}
