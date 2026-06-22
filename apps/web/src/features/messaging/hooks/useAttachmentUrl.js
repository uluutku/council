import { useCallback, useEffect, useRef, useState } from 'react';
import { createAttachmentSignedUrl } from '../api/attachmentsApi.js';
import { getCachedAttachmentUrl, setCachedAttachmentUrl } from '../queries/attachmentUrlCache.js';

// Resolves a short-lived signed URL for a single attachment, reusing the memory
// cache so a visible image is not re-signed on every render. Images pass
// autoLoad so they resolve when mounted; documents leave it off and call
// resolve() on demand from an Open/Download action.
export function useAttachmentUrl(attachment, { autoLoad = false, download } = {}) {
  const [state, setState] = useState(() => {
    const cached = attachment ? getCachedAttachmentUrl(attachment.id) : null;
    return { url: cached, status: cached ? 'ready' : 'idle', error: null };
  });
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const resolve = useCallback(async () => {
    if (!attachment) return null;

    if (!download) {
      const cached = getCachedAttachmentUrl(attachment.id);
      if (cached) {
        setState({ url: cached, status: 'ready', error: null });
        return cached;
      }
    }

    setState((current) => ({ ...current, status: 'loading', error: null }));
    try {
      const { url, expiresIn } = await createAttachmentSignedUrl({
        storageBucket: attachment.storage_bucket,
        storagePath: attachment.storage_path,
        download: download ? attachment.original_filename : undefined,
      });
      // Only the cacheable view URL is stored; download URLs are one-shot.
      if (!download) setCachedAttachmentUrl(attachment.id, url, expiresIn);
      if (activeRef.current && !download) setState({ url, status: 'ready', error: null });
      else if (activeRef.current) setState((current) => ({ ...current, status: 'ready' }));
      return url;
    } catch (error) {
      if (activeRef.current) {
        setState((current) => ({ ...current, status: 'error', error }));
      }
      return null;
    }
  }, [attachment, download]);

  useEffect(() => {
    if (!autoLoad || !attachment) return;
    const cached = getCachedAttachmentUrl(attachment.id);
    if (cached) {
      setState({ url: cached, status: 'ready', error: null });
      return;
    }
    resolve();
  }, [autoLoad, attachment, resolve]);

  return { ...state, resolve };
}
