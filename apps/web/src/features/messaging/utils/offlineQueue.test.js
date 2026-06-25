import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearConversationDraft,
  listQueuedMessagesForConversation,
  loadConversationDraft,
  persistQueuedMessage,
  removeQueuedMessage,
  saveConversationDraft,
} from './offlineQueue.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_MESSAGE_ID = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  localStorage.clear();
});

describe('offlineQueue storage', () => {
  it('stores drafts per user and conversation', () => {
    expect(saveConversationDraft(USER_ID, CONVERSATION_ID, 'hello draft')).toBe(true);
    expect(loadConversationDraft(USER_ID, CONVERSATION_ID)).toBe('hello draft');
    expect(loadConversationDraft(OTHER_USER_ID, CONVERSATION_ID)).toBe('');

    expect(clearConversationDraft(USER_ID, CONVERSATION_ID)).toBe(true);
    expect(loadConversationDraft(USER_ID, CONVERSATION_ID)).toBe('');
  });

  it('validates and scopes queued messages', () => {
    expect(
      persistQueuedMessage({
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        clientMessageId: CLIENT_MESSAGE_ID,
        content: 'queued text',
        replyToMessageId: null,
        createdAt: '2026-06-26T10:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      persistQueuedMessage({
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        clientMessageId: 'not-a-uuid',
        content: 'bad',
        replyToMessageId: null,
        createdAt: '2026-06-26T10:00:00.000Z',
      }),
    ).toBe(false);

    expect(listQueuedMessagesForConversation(USER_ID, CONVERSATION_ID)).toHaveLength(1);
    expect(listQueuedMessagesForConversation(OTHER_USER_ID, CONVERSATION_ID)).toHaveLength(0);

    expect(removeQueuedMessage(USER_ID, CLIENT_MESSAGE_ID)).toBe(true);
    expect(listQueuedMessagesForConversation(USER_ID, CONVERSATION_ID)).toHaveLength(0);
  });
});
