import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createAiDocumentUpload,
  finalizeAiDocumentUpload,
  removeAiDocumentUpload,
  uploadAiDocumentObject,
} from '../api/aiDocumentsApi.js';
import { validateAiDocumentSelection } from '../utils/aiDocuments.js';

export function useAiDocumentDraft(conversationId) {
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
        const target = await createAiDocumentUpload({
          conversation_id: conversationId,
          original_filename: draft.filename,
          mime_type: draft.mimeType,
          size_bytes: draft.sizeBytes,
        });
        attachmentId = target.attachment_id;
        patch(draft.draftId, { attachmentId, storagePath: target.storage_path });
        await uploadAiDocumentObject({ storagePath: target.storage_path, file: draft.file });
        await finalizeAiDocumentUpload(attachmentId);
        patch(draft.draftId, { attachmentId, status: 'ready' });
      } catch (error) {
        patch(draft.draftId, {
          attachmentId,
          status: 'failed',
          errorCategory: error?.category ?? 'document_unavailable',
        });
      }
    },
    [conversationId, patch],
  );

  const addFiles = useCallback(
    (files) => {
      consumedRef.current = false;
      const result = validateAiDocumentSelection(files, draftsRef.current);
      const created = result.accepted.map((file) => ({
        draftId: crypto.randomUUID(),
        file,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        attachmentId: null,
        storagePath: null,
        status: 'uploading',
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
    if (draft?.attachmentId) removeAiDocumentUpload(draft.attachmentId).catch(() => {});
    setDrafts((current) => current.filter((item) => item.draftId !== draftId));
  }, []);

  const retryDraft = useCallback(
    async (draftId) => {
      const draft = draftsRef.current.find((item) => item.draftId === draftId);
      if (!draft) return;
      if (draft.attachmentId) await removeAiDocumentUpload(draft.attachmentId).catch(() => {});
      upload({ ...draft, attachmentId: null, storagePath: null });
    },
    [upload],
  );

  const consume = useCallback(() => {
    const ready = draftsRef.current.filter((draft) => draft.status === 'ready');
    consumedRef.current = true;
    setDrafts([]);
    return ready;
  }, []);

  useEffect(
    () => () => {
      if (consumedRef.current) return;
      for (const draft of draftsRef.current) {
        if (draft.attachmentId) removeAiDocumentUpload(draft.attachmentId).catch(() => {});
      }
    },
    [conversationId],
  );

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
