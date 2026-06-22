import {
  aiImageUploadInputSchema,
  aiImageUploadTargetSchema,
  finalizedAiImageSchema,
} from '@council/schemas';
import { getSupabaseClient } from '../../../lib/supabase.js';
import { toAiApiError } from './aiErrors.js';

export const AI_IMAGE_BUCKET = 'ai-chat-images';
export const AI_IMAGE_SIGNED_URL_TTL_SECONDS = 600;

export async function createAiImageUpload(input, client = getSupabaseClient()) {
  const parsed = aiImageUploadInputSchema.parse(input);
  const { data, error } = await client
    .rpc('create_ai_image_upload', {
      p_conversation_id: parsed.conversation_id,
      p_original_filename: parsed.original_filename,
      p_mime_type: parsed.mime_type,
      p_size_bytes: parsed.size_bytes,
    })
    .single();
  if (error) throw toAiApiError(error);
  return aiImageUploadTargetSchema.parse(data);
}

export async function uploadAiImageObject({ storagePath, file }, client = getSupabaseClient()) {
  const { error } = await client.storage.from(AI_IMAGE_BUCKET).upload(storagePath, file, {
    contentType: file.type,
    cacheControl: 'no-store',
    upsert: false,
  });
  if (error) throw toAiApiError(error);
  return true;
}

export async function finalizeAiImageUpload(
  { attachmentId, width, height },
  client = getSupabaseClient(),
) {
  const { data, error } = await client
    .rpc('finalize_ai_image_upload', {
      p_attachment_id: attachmentId,
      p_width: width,
      p_height: height,
    })
    .single();
  if (error) throw toAiApiError(error);
  return finalizedAiImageSchema.parse(data);
}

export async function removeAiImageUpload(attachmentId, client = getSupabaseClient()) {
  const { data, error } = await client
    .rpc('remove_ai_image_upload', { p_attachment_id: attachmentId })
    .single();
  if (error) throw toAiApiError(error);
  if (data?.storage_path) {
    const { error: storageError } = await client.storage
      .from(AI_IMAGE_BUCKET)
      .remove([data.storage_path]);
    if (storageError) throw toAiApiError(storageError);
  }
  const { error: completeError } = await client.rpc('complete_remove_ai_image_upload', {
    p_attachment_id: attachmentId,
  });
  if (completeError) throw toAiApiError(completeError);
  return true;
}

export async function createAiImageSignedUrl(
  { storagePath, expiresIn = AI_IMAGE_SIGNED_URL_TTL_SECONDS },
  client = getSupabaseClient(),
) {
  const { data, error } = await client.storage
    .from(AI_IMAGE_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw toAiApiError(error);
  return { url: data.signedUrl, expiresIn };
}
