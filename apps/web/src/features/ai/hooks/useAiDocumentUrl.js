import { useCallback, useState } from 'react';
import { createAiDocumentSignedUrl } from '../api/aiDocumentsApi.js';
import { getCachedAiDocumentUrl, setCachedAiDocumentUrl } from '../queries/aiDocumentUrlCache.js';

export function useAiDocumentUrl(conversationId, document) {
  const [status, setStatus] = useState('idle');
  const resolve = useCallback(async () => {
    const cached = getCachedAiDocumentUrl(conversationId, document.id);
    if (cached) return cached;
    setStatus('loading');
    try {
      const result = await createAiDocumentSignedUrl(document.id);
      setCachedAiDocumentUrl(conversationId, document.id, result.url, result.expiresIn);
      setStatus('ready');
      return result.url;
    } catch {
      setStatus('error');
      return null;
    }
  }, [conversationId, document.id]);
  return { status, resolve };
}
