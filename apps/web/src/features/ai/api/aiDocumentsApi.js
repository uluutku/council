import {
  aiDocumentAccessTargetSchema,
  aiDocumentUploadInputSchema,
  aiDocumentUploadTargetSchema,
  finalizedAiDocumentSchema,
} from '@council/schemas';
import { getSupabaseClient } from '../../../lib/supabase.js';
import { toAiApiError } from './aiErrors.js';

export const AI_DOCUMENT_BUCKET = 'ai-chat-documents';
export const AI_DOCUMENT_URL_TTL_SECONDS = 600;

export async function createAiDocumentUpload(input, client = getSupabaseClient()) {
  const parsed = aiDocumentUploadInputSchema.parse(input);
  const { data, error } = await client
    .rpc('create_ai_document_upload', {
      p_conversation_id: parsed.conversation_id,
      p_original_filename: parsed.original_filename,
      p_mime_type: parsed.mime_type,
      p_size_bytes: parsed.size_bytes,
    })
    .single();
  if (error) throw toAiApiError(error);
  return aiDocumentUploadTargetSchema.parse(data);
}

export async function uploadAiDocumentObject({ storagePath, file }, client = getSupabaseClient()) {
  const { error } = await client.storage.from(AI_DOCUMENT_BUCKET).upload(storagePath, file, {
    contentType: file.type,
    cacheControl: 'no-store',
    upsert: false,
  });
  if (error) throw toAiApiError(error);
}

export async function finalizeAiDocumentUpload(attachmentId, client = getSupabaseClient()) {
  const { data, error } = await client
    .rpc('finalize_ai_document_upload', { p_attachment_id: attachmentId })
    .single();
  if (error) throw toAiApiError(error);
  return finalizedAiDocumentSchema.parse(data);
}

export async function removeAiDocumentUpload(attachmentId, client = getSupabaseClient()) {
  const { data, error } = await client
    .rpc('remove_ai_document_upload', { p_attachment_id: attachmentId })
    .single();
  if (error) throw toAiApiError(error);
  const target = aiDocumentAccessTargetSchema.parse(data);
  const { error: storageError } = await client.storage
    .from(target.storage_bucket)
    .remove([target.storage_path]);
  if (storageError) throw toAiApiError(storageError);
  const { error: completeError } = await client.rpc('complete_remove_ai_document_upload', {
    p_attachment_id: attachmentId,
  });
  if (completeError) throw toAiApiError(completeError);
}

export async function createAiDocumentSignedUrl(attachmentId, client = getSupabaseClient()) {
  const { data, error } = await client
    .rpc('create_ai_document_url', { p_attachment_id: attachmentId })
    .single();
  if (error) throw toAiApiError(error);
  const target = aiDocumentAccessTargetSchema.parse(data);
  const { data: signed, error: signedError } = await client.storage
    .from(target.storage_bucket)
    .createSignedUrl(target.storage_path, AI_DOCUMENT_URL_TTL_SECONDS);
  if (signedError) throw toAiApiError(signedError);
  return { url: signed.signedUrl, expiresIn: AI_DOCUMENT_URL_TTL_SECONDS };
}
