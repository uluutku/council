import { useEffect, useState } from 'react';
import { createSignedAvatarUrl } from '../lib/avatarStorage.js';

export function useSignedAvatarUrl(bucket, path) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let cancelled = false;

    if (!bucket || !path) {
      return () => {
        cancelled = true;
      };
    }

    createSignedAvatarUrl(bucket, path)
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [bucket, path]);

  return bucket && path ? url : '';
}
