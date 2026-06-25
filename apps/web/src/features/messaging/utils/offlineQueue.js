import { z } from 'zod';

const STORAGE_VERSION = 1;
const MAX_QUEUE_ITEMS_PER_USER = 50;
const MAX_MESSAGE_LENGTH = 8000;
const DRAFT_PREFIX = 'council.messaging.draft.v1';
const QUEUE_KEY = 'council.messaging.offlineQueue.v1';

const uuidSchema = z.string().uuid();
const draftSchema = z.string().max(MAX_MESSAGE_LENGTH);
const queuedMessageSchema = z
  .object({
    version: z.literal(STORAGE_VERSION),
    userId: uuidSchema,
    conversationId: uuidSchema,
    clientMessageId: uuidSchema,
    content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
    replyToMessageId: uuidSchema.nullable().default(null),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
const queuedMessageListSchema = z.array(queuedMessageSchema);

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

function readQueue() {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = queuedMessageListSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  const storage = getStorage();
  if (!storage) return false;
  const parsed = queuedMessageListSchema.safeParse(items);
  if (!parsed.success) return false;
  try {
    storage.setItem(QUEUE_KEY, JSON.stringify(parsed.data));
    return true;
  } catch {
    return false;
  }
}

export function loadConversationDraft(userId, conversationId) {
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

export function saveConversationDraft(userId, conversationId, value) {
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

export function clearConversationDraft(userId, conversationId) {
  return saveConversationDraft(userId, conversationId, '');
}

export function listQueuedMessages(userId) {
  if (!isUuid(userId)) return [];
  return readQueue().filter((item) => item.userId === userId);
}

export function listQueuedMessagesForConversation(userId, conversationId) {
  if (!isUuid(conversationId)) return [];
  return listQueuedMessages(userId).filter((item) => item.conversationId === conversationId);
}

export function persistQueuedMessage(item) {
  const parsed = queuedMessageSchema.safeParse({ version: STORAGE_VERSION, ...item });
  if (!parsed.success) return false;
  const queue = readQueue().filter(
    (entry) =>
      !(
        entry.userId === parsed.data.userId && entry.clientMessageId === parsed.data.clientMessageId
      ),
  );
  const userItems = queue.filter((entry) => entry.userId === parsed.data.userId);
  const otherItems = queue.filter((entry) => entry.userId !== parsed.data.userId);
  const nextUserItems = [...userItems, parsed.data].slice(-MAX_QUEUE_ITEMS_PER_USER);
  return writeQueue([...otherItems, ...nextUserItems]);
}

export function removeQueuedMessage(userId, clientMessageId) {
  if (!isUuid(userId) || !isUuid(clientMessageId)) return false;
  const next = readQueue().filter(
    (item) => !(item.userId === userId && item.clientMessageId === clientMessageId),
  );
  return writeQueue(next);
}

export function queuedMessageToOutgoing(item) {
  const parsed = queuedMessageSchema.safeParse(item);
  if (!parsed.success) return null;
  return {
    clientMessageId: parsed.data.clientMessageId,
    content: parsed.data.content,
    replyToMessageId: parsed.data.replyToMessageId,
    attachments: [],
    attachmentIds: [],
    createdAt: parsed.data.createdAt,
    status: 'queued',
    errorCategory: null,
  };
}
