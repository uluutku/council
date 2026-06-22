import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createAiImageUpload,
  finalizeAiImageUpload,
  removeAiImageUpload,
  uploadAiImageObject,
} from '../api/aiImagesApi.js';
import {
  createAiImagePreview,
  readAiImageDimensions,
  revokeAiImagePreview,
  validateAiImageSelection,
} from '../utils/aiImages.js';

export function useAiImageDraft(conversationId) {
  const [drafts, setDrafts] = useState([]);
  const draftsRef = useRef(drafts);
  const consumedRef = useRef(false);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const patch = useCallback((draftId, values) => {
    setDrafts((current) =>
      current.map((draft) => (draft.draftId === draftId ? { ...draft, ...values } : draft)),
    );
  }, []);

  const upload = useCallback(
    async (draft) => {
      patch(draft.draftId, { status: 'uploading', errorCategory: null });
      let attachmentId = draft.attachmentId;
      try {
        const dimensions = await readAiImageDimensions(draft.file);
        if (!attachmentId) {
          const target = await createAiImageUpload({
            conversation_id: conversationId,
            original_filename: draft.filename,
            mime_type: draft.mimeType,
            size_bytes: draft.sizeBytes,
          });
          attachmentId = target.attachment_id;
          patch(draft.draftId, {
            attachmentId,
            storageBucket: target.storage_bucket,
            storagePath: target.storage_path,
          });
          await uploadAiImageObject({ storagePath: target.storage_path, file: draft.file });
        }
        await finalizeAiImageUpload({
          attachmentId,
          width: dimensions.width,
          height: dimensions.height,
        });
        patch(draft.draftId, {
          status: 'ready',
          attachmentId,
          width: dimensions.width,
          height: dimensions.height,
        });
      } catch (error) {
        patch(draft.draftId, {
          status: 'failed',
          attachmentId,
          errorCategory: error?.category ?? error?.message ?? 'invalid_image',
        });
      }
    },
    [conversationId, patch],
  );

  const addFiles = useCallback(
    (files) => {
      consumedRef.current = false;
      const result = validateAiImageSelection(files, draftsRef.current);
      const created = result.accepted.map((file) => ({
        draftId: crypto.randomUUID(),
        file,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        previewUrl: createAiImagePreview(file),
        status: 'uploading',
        attachmentId: null,
        storageBucket: null,
        storagePath: null,
        width: null,
        height: null,
        errorCategory: null,
      }));
      setDrafts((current) => [...current, ...created]);
      for (const draft of created) upload(draft);
      return { rejected: result.rejected };
    },
    [upload],
  );

  const removeDraft = useCallback((draftId) => {
    const draft = draftsRef.current.find((item) => item.draftId === draftId);
    if (!draft) return;
    revokeAiImagePreview(draft.previewUrl);
    if (draft.attachmentId) removeAiImageUpload(draft.attachmentId).catch(() => {});
    setDrafts((current) => current.filter((item) => item.draftId !== draftId));
  }, []);

  const retryDraft = useCallback(
    async (draftId) => {
      const draft = draftsRef.current.find((item) => item.draftId === draftId);
      if (!draft) return;
      if (draft.attachmentId) {
        await removeAiImageUpload(draft.attachmentId).catch(() => {});
      }
      const reset = {
        ...draft,
        attachmentId: null,
        storageBucket: null,
        storagePath: null,
      };
      patch(draftId, reset);
      upload(reset);
    },
    [patch, upload],
  );

  const consume = useCallback(() => {
    const ready = draftsRef.current.filter((draft) => draft.status === 'ready');
    consumedRef.current = true;
    setDrafts([]);
    return ready;
  }, []);

  useEffect(() => {
    consumedRef.current = false;
    return () => {
      if (consumedRef.current) return;
      for (const draft of draftsRef.current) {
        revokeAiImagePreview(draft.previewUrl);
        if (draft.attachmentId) removeAiImageUpload(draft.attachmentId).catch(() => {});
      }
    };
  }, [conversationId]);

  return {
    drafts,
    addFiles,
    removeDraft,
    retryDraft,
    consume,
    hasAny: drafts.length > 0,
    allReady: drafts.length > 0 && drafts.every((draft) => draft.status === 'ready'),
    isUploading: drafts.some((draft) => draft.status === 'uploading'),
  };
}
