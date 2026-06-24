import { getSupabaseClient } from './supabase.js';

export const PROFILE_AVATAR_BUCKET = 'profile-avatars';
export const PERSONA_AVATAR_BUCKET = 'persona-avatars';
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const AVATAR_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function avatarError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function randomUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

function validateAvatarFile(file) {
  if (!file) throw avatarError('avatar_missing', 'Choose an avatar image.');
  if (!AVATAR_EXTENSIONS[file.type]) {
    throw avatarError('avatar_type', 'Use a JPEG, PNG, or WebP image.');
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw avatarError('avatar_too_large', 'Avatar image must be 2 MB or smaller.');
  }
}

export function avatarUploadErrorMessage(error) {
  if (error?.code === 'avatar_type') return 'Use a JPEG, PNG, or WebP image.';
  if (error?.code === 'avatar_too_large') return 'Avatar image must be 2 MB or smaller.';
  if (isBucketMissingError(error)) {
    return 'Avatar storage is not configured yet. Apply the latest database migrations and try again.';
  }
  if (error?.message === 'invalid_avatar_path') return 'Choose an avatar from your account.';
  return null;
}

function isBucketMissingError(error) {
  const status = Number(error?.statusCode ?? error?.status ?? 0);
  const text = `${error?.error ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return text.includes('bucket not found') || (status === 404 && text.includes('bucket'));
}

export async function uploadAvatarFile(bucket, file, client = getSupabaseClient()) {
  validateAvatarFile(file);

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError) throw authError;
  if (!user?.id) throw avatarError('avatar_auth', 'Sign in before uploading an avatar.');

  const extension = AVATAR_EXTENSIONS[file.type];
  const path = `users/${user.id}/${randomUuid()}.${extension}`;
  const { error } = await client.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function removeAvatarFile(bucket, path, client = getSupabaseClient()) {
  if (!path) return;
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) throw error;
}

export async function createSignedAvatarUrl(bucket, path, client = getSupabaseClient()) {
  if (!path) return '';
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 600);
  if (error) throw error;
  return data?.signedUrl ?? '';
}
