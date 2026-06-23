import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearNotificationState,
  notificationBody,
  shouldNotifyMessage,
} from './browserNotifications.js';

beforeEach(clearNotificationState);

describe('browser notifications', () => {
  const base = {
    messageId: 'message-1',
    senderId: 'peer',
    currentUserId: 'me',
    conversationId: 'conversation',
    activeConversationId: null,
    pageVisible: true,
    muted: false,
    enabled: true,
    permission: 'granted',
  };

  it('suppresses muted and active visible conversations', () => {
    expect(shouldNotifyMessage({ ...base, muted: true })).toBe(false);
    expect(
      shouldNotifyMessage({ ...base, activeConversationId: 'conversation', pageVisible: true }),
    ).toBe(false);
  });

  it('prevents duplicate notifications for the same message', () => {
    expect(shouldNotifyMessage(base)).toBe(true);
    expect(shouldNotifyMessage(base)).toBe(false);
  });

  it('respects preview preference and deleted content', () => {
    const message = { content: 'A private message', deleted_at: null };
    expect(notificationBody(message, false)).toBe('New message');
    expect(notificationBody(message, true)).toBe('A private message');
    expect(notificationBody({ ...message, deleted_at: new Date().toISOString() }, true)).toBe(
      'New message',
    );
  });
});
