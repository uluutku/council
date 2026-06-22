import { useCallback, useEffect, useRef, useState } from 'react';
import { isImageMimeType } from '@council/schemas';
import {
  createMessageAttachmentUpload,
  finalizeMessageAttachment,
  removeMessageAttachment,
  uploadAttachmentObject,
} from '../api/attachmentsApi.js';
import {
  createPreviewUrl,
  readImageDimensions,
  revokePreviewUrl,
  validateAttachmentSelection,
} from '../utils/attachments.js';

// Composer-side attachment lifecycle for one conversation. Selected files are
// validated, then each is reserved, uploaded to the private bucket, and
// finalized — moving pending → uploading → ready (or failed). Sending is gated
// on every draft reaching ready. consume() hands the ready drafts to the send
// pipeline and clears local state without server cleanup, because the send is
// about to attach them. Abandoned drafts are cleaned up on unmount.

function newDraftId() {
  return globalThis.crypto.randomUUID();
}

export function useAttachmentDraft(conversationId) {
  const [drafts, setDrafts] = useState([]);
  const draftsRef = useRef(drafts);
  const consumedRef = useRef(false);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const patchDraft = useCallback((draftId, patch) => {
    setDrafts((current) =>
      current.map((draft) => (draft.draftId === draftId ? { ...draft, ...patch } : draft)),
    );
  }, []);

  const runUpload = useCallback(
    async (draft) => {
      patchDraft(draft.draftId, { status: 'uploading', errorCategory: null });
      try {
        const dimensions = draft.isImage ? await readImageDimensions(draft.file) : null;
        const target = await createMessageAttachmentUpload({
          conversation_id: conversationId,
          original_filename: draft.filename,
          mime_type: draft.mimeType,
          size_bytes: draft.sizeBytes,
        });
        await uploadAttachmentObject({ storagePath: target.storage_path, file: draft.file });
        await finalizeMessageAttachment({
          attachment_id: target.attachment_id,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
        });
        patchDraft(draft.draftId, {
          status: 'ready',
          attachmentId: target.attachment_id,
          storageBucket: target.storage_bucket,
          storagePath: target.storage_path,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
        });
      } catch (error) {
        patchDraft(draft.draftId, {
          status: 'failed',
          errorCategory: error?.category ?? 'unknown_error',
        });
      }
    },
    [conversationId, patchDraft],
  );

  const addFiles = useCallback(
    (fileList) => {
      const files = Array.from(fileList ?? []);
      const { accepted, rejected } = validateAttachmentSelection(files, draftsRef.current.length);

      const created = accepted.map((file) => ({
        draftId: newDraftId(),
        file,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        isImage: isImageMimeType(file.type),
        previewUrl: createPreviewUrl(file),
        width: null,
        height: null,
        status: 'uploading',
        attachmentId: null,
        storageBucket: null,
        storagePath: null,
        errorCategory: null,
      }));

      if (created.length > 0) {
        setDrafts((current) => [...current, ...created]);
        for (const draft of created) runUpload(draft);
      }

      return { rejected };
    },
    [runUpload],
  );

  const retryDraft = useCallback(
    (draftId) => {
      const draft = draftsRef.current.find((entry) => entry.draftId === draftId);
      if (draft) runUpload(draft);
    },
    [runUpload],
  );

  const removeDraft = useCallback((draftId) => {
    const draft = draftsRef.current.find((entry) => entry.draftId === draftId);
    if (!draft) return;
    revokePreviewUrl(draft.previewUrl);
    // A reserved upload that will not be sent is cleaned up on the server.
    if (draft.attachmentId) {
      removeMessageAttachment(draft.attachmentId).catch(() => {});
    }
    setDrafts((current) => current.filter((entry) => entry.draftId !== draftId));
  }, []);

  // Hands the ready drafts to the caller and clears state without server-side
  // cleanup — the send is about to attach them. Preview URLs are transferred to
  // the optimistic message, which revokes them when it resolves.
  const consume = useCallback(() => {
    const ready = draftsRef.current.filter((draft) => draft.status === 'ready');
    consumedRef.current = true;
    setDrafts([]);
    return ready;
  }, []);

  const readyCount = drafts.filter((draft) => draft.status === 'ready').length;
  const allReady = drafts.length > 0 && readyCount === drafts.length;
  const isUploading = drafts.some((draft) => draft.status === 'uploading');
  const hasFailed = drafts.some((draft) => draft.status === 'failed');

  // Reset when the conversation changes; clean up abandoned reservations.
  useEffect(() => {
    consumedRef.current = false;
    return () => {
      if (consumedRef.current) return;
      for (const draft of draftsRef.current) {
        revokePreviewUrl(draft.previewUrl);
        if (draft.attachmentId) removeMessageAttachment(draft.attachmentId).catch(() => {});
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
    allReady,
    isUploading,
    hasFailed,
  };
}
