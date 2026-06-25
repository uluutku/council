import { z } from 'zod';

const MAX_DRAFT_LENGTH = 8000;
const DRAFT_PREFIX = 'council.ai.draft.v1';

const uuidSchema = z.string().uuid();
const draftSchema = z.string().max(MAX_DRAFT_LENGTH);

function getStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isUuid(value) {
  return uuidSchema.safeParse(value).success;
}

function draftKey(userId, conversationId) {
  if (!isUuid(userId) || !isUuid(conversationId)) return null;
  return `${DRAFT_PREFIX}:${userId}:${conversationId}`;
}

export function loadAiDraft(userId, conversationId) {
  const key = draftKey(userId, conversationId);
  const storage = getStorage();
  if (!key || !storage) return '';
  try {
    const parsed = draftSchema.safeParse(storage.getItem(key) ?? '');
    return parsed.success ? parsed.data : '';
  } catch {
    return '';
  }
}

export function saveAiDraft(userId, conversationId, value) {
  const key = draftKey(userId, conversationId);
  const storage = getStorage();
  if (!key || !storage) return false;
  const parsed = draftSchema.safeParse(value);
  if (!parsed.success) return false;
  try {
    if (parsed.data.length === 0) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, parsed.data);
    }
    return true;
  } catch {
    return false;
  }
}

export function clearAiDraft(userId, conversationId) {
  return saveAiDraft(userId, conversationId, '');
}
