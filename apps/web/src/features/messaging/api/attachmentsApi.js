import {
  attachmentUploadTargetSchema,
  createAttachmentUploadInputSchema,
  finalizeAttachmentInputSchema,
  finalizedAttachmentSchema,
} from '@council/schemas';
import { getSupabaseClient } from '../../../lib/supabase.js';
import { toMessagingApiError } from './messagingErrors.js';

// Staged private-attachment upload flow. The browser never chooses a Storage
// path: it reserves one through the database (which validates membership, MIME
// type, extension, and size), uploads to exactly that path, then finalizes the
// metadata. Signed URLs are minted on demand and never persisted or broadcast.

const ATTACHMENT_BUCKET = 'message-attachments';
const SIGNED_URL_TTL_SECONDS = 600;

// Reserves an attachment slot and returns the only Storage path RLS will allow
// this uploader to write.
export async function createMessageAttachmentUpload(input, client = getSupabaseClient()) {
  const parsed = createAttachmentUploadInputSchema.parse(input);
  const { data, error } = await client
    .rpc('create_message_attachment_upload', {
      p_conversation_id: parsed.conversation_id,
      p_original_filename: parsed.original_filename,
      p_mime_type: parsed.mime_type,
      p_size_bytes: parsed.size_bytes,
    })
    .single();

  if (error) throw toMessagingApiError(error);
  return attachmentUploadTargetSchema.parse(data);
}

// Uploads the file bytes to the reserved private path. Storage INSERT RLS
// rejects any path that does not match a pending reservation owned by the caller.
export async function uploadAttachmentObject({ storagePath, file }, client = getSupabaseClient()) {
  const { error } = await client.storage.from(ATTACHMENT_BUCKET).upload(storagePath, file, {
    contentType: file.type,
    cacheControl: 'no-store',
    upsert: false,
  });

  if (error) throw toMessagingApiError(error);
  return true;
}

// Confirms the object exists and records optional image dimensions, marking the
// attachment ready to be sent.
export async function finalizeMessageAttachment(input, client = getSupabaseClient()) {
  const parsed = finalizeAttachmentInputSchema.parse(input);
  const { data, error } = await client
    .rpc('finalize_message_attachment', {
      p_attachment_id: parsed.attachment_id,
      p_width: parsed.width,
      p_height: parsed.height,
    })
    .single();

  if (error) throw toMessagingApiError(error);
  return finalizedAttachmentSchema.parse(data);
}

// Removes an unattached upload (cancel-before-send / cleanup) and deletes the
// physical object the caller owns. Best-effort physical removal: access is
// already revoked once the metadata row is gone.
export async function removeMessageAttachment(attachmentId, client = getSupabaseClient()) {
  const { data, error } = await client
    .rpc('remove_message_attachment', { p_attachment_id: attachmentId })
    .single();

  if (error) throw toMessagingApiError(error);

  if (data?.storage_path) {
    await client.storage.from(ATTACHMENT_BUCKET).remove([data.storage_path]);
  }
  return true;
}

// Mints a short-lived signed URL for an attachment. Authorization is enforced by
// Storage SELECT RLS at request time, so a deleted message's attachment can no
// longer produce a URL.
export async function createAttachmentSignedUrl(
  { storageBucket = ATTACHMENT_BUCKET, storagePath, expiresIn = SIGNED_URL_TTL_SECONDS, download },
  client = getSupabaseClient(),
) {
  const options = download ? { download } : undefined;
  const { data, error } = await client.storage
    .from(storageBucket)
    .createSignedUrl(storagePath, expiresIn, options);

  if (error) throw toMessagingApiError(error);
  return { url: data.signedUrl, expiresIn };
}

export { ATTACHMENT_BUCKET, SIGNED_URL_TTL_SECONDS };
