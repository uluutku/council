import { useCallback, useEffect, useState } from 'react';
import { createAiImageSignedUrl } from '../api/aiImagesApi.js';
import { getCachedAiImageUrl, setCachedAiImageUrl } from '../queries/aiImageUrlCache.js';

export function useAiImageUrl(conversationId, attachment) {
  const [state, setState] = useState(() => {
    const url = attachment ? getCachedAiImageUrl(conversationId, attachment.id) : null;
    return { url, status: url ? 'ready' : 'idle' };
  });

  const resolve = useCallback(async () => {
    if (!attachment) return null;
    const cached = getCachedAiImageUrl(conversationId, attachment.id);
    if (cached) {
      setState({ url: cached, status: 'ready' });
      return cached;
    }
    setState((current) => ({ ...current, status: 'loading' }));
    try {
      const result = await createAiImageSignedUrl({ storagePath: attachment.storage_path });
      setCachedAiImageUrl(conversationId, attachment.id, result.url, result.expiresIn);
      setState({ url: result.url, status: 'ready' });
      return result.url;
    } catch {
      setState({ url: null, status: 'error' });
      return null;
    }
  }, [attachment, conversationId]);

  useEffect(() => {
    if (!attachment || attachment.preview_url) return;
    const timer = window.setTimeout(() => resolve(), 0);
    return () => window.clearTimeout(timer);
  }, [attachment, resolve]);

  return { ...state, resolve };
}
