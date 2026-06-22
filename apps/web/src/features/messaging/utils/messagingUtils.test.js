import { describe, expect, it } from 'vitest';
import { tokenizeMessageContent, previewExcerpt } from './messageContent.js';
import { flattenMessagePages, olderCursor, highestLoadedSequence } from './messageList.js';
import { isSameCalendarDay } from './datetime.js';
import { deriveOutgoingReceipt, mergePeerReceipt, RECEIPT_STATUS } from './receipts.js';
import { summarizeReactions } from './reactions.js';
import { peerInitials, peerName } from './peer.js';
import { isConversationAccessError, messagingErrorMessage } from '../api/messagingErrorMessages.js';
import { MessagingApiError } from '../api/messagingErrors.js';

describe('tokenizeMessageContent', () => {
  it('returns plain text tokens for content without links', () => {
    expect(tokenizeMessageContent('hello world')).toEqual([{ type: 'text', value: 'hello world' }]);
  });

  it('linkifies only safe http(s) URLs and preserves surrounding text', () => {
    const tokens = tokenizeMessageContent('see https://example.com now');
    expect(tokens).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', href: 'https://example.com', value: 'https://example.com' },
      { type: 'text', value: ' now' },
    ]);
  });

  it('does not linkify javascript: or other schemes', () => {
    const tokens = tokenizeMessageContent('javascript:alert(1) and data:text/html,x');
    expect(tokens.every((token) => token.type === 'text')).toBe(true);
  });

  it('keeps trailing punctuation out of the link target', () => {
    const tokens = tokenizeMessageContent('visit https://example.com.');
    expect(tokens).toEqual([
      { type: 'text', value: 'visit ' },
      { type: 'link', href: 'https://example.com', value: 'https://example.com' },
      { type: 'text', value: '.' },
    ]);
  });
});

describe('previewExcerpt', () => {
  it('collapses whitespace and clamps long content', () => {
    expect(previewExcerpt('a\n\n  b   c')).toBe('a b c');
    expect(previewExcerpt('x'.repeat(200), 10)).toHaveLength(10);
  });
});

describe('flattenMessagePages', () => {
  const page = (...messages) => messages;

  it('flattens newest-first pages into one ascending, de-duplicated list', () => {
    const pages = [
      page({ id: 'b', sequence: 2, content: 'two' }, { id: 'a', sequence: 1, content: 'one' }),
    ];
    expect(flattenMessagePages(pages).map((message) => message.id)).toEqual(['a', 'b']);
  });

  it('de-duplicates the same id appearing across pages', () => {
    const pages = [
      page({ id: 'b', sequence: 2 }),
      page({ id: 'b', sequence: 2 }, { id: 'a', sequence: 1 }),
    ];
    expect(flattenMessagePages(pages).map((message) => message.id)).toEqual(['a', 'b']);
  });
});

describe('olderCursor', () => {
  it('returns the smallest sequence when a full page was returned', () => {
    const lastPage = [{ sequence: 5 }, { sequence: 4 }, { sequence: 3 }];
    expect(olderCursor(lastPage, 3)).toBe(3);
  });

  it('returns undefined when the page was short (nothing older)', () => {
    expect(olderCursor([{ sequence: 5 }], 50)).toBeUndefined();
    expect(olderCursor([], 50)).toBeUndefined();
  });
});

describe('highestLoadedSequence', () => {
  it('returns the maximum sequence or zero', () => {
    expect(highestLoadedSequence([{ sequence: 3 }, { sequence: 7 }])).toBe(7);
    expect(highestLoadedSequence([])).toBe(0);
  });
});

describe('isSameCalendarDay', () => {
  it('compares local calendar days', () => {
    // Local (no offset) timestamps keep this assertion timezone-independent.
    expect(isSameCalendarDay('2026-06-22T01:00:00', '2026-06-22T23:00:00')).toBe(true);
    expect(isSameCalendarDay('2026-06-22T01:00:00', '2026-06-23T01:00:00')).toBe(false);
  });
});

describe('deriveOutgoingReceipt', () => {
  it('reports read, delivered, or sent honestly', () => {
    expect(deriveOutgoingReceipt(5, { readSequence: 5, deliveredSequence: 5 })).toBe(
      RECEIPT_STATUS.read,
    );
    expect(deriveOutgoingReceipt(5, { readSequence: 4, deliveredSequence: 5 })).toBe(
      RECEIPT_STATUS.delivered,
    );
    expect(deriveOutgoingReceipt(5, { readSequence: 0, deliveredSequence: 0 })).toBe(
      RECEIPT_STATUS.sent,
    );
  });
});

describe('mergePeerReceipt', () => {
  it('advances monotonically and never moves backwards', () => {
    const merged = mergePeerReceipt(
      { readSequence: 5, deliveredSequence: 6 },
      { readSequence: 3, deliveredSequence: 4 },
    );
    expect(merged).toEqual({ readSequence: 5, deliveredSequence: 6 });
  });
});

describe('summarizeReactions', () => {
  it('groups by emoji with counts and whether the current user reacted', () => {
    const reactions = [
      { emoji: '👍', user_id: 'me' },
      { emoji: '👍', user_id: 'peer' },
      { emoji: '❤️', user_id: 'peer' },
    ];
    expect(summarizeReactions(reactions, 'me')).toEqual([
      { emoji: '👍', count: 2, reactedByMe: true },
      { emoji: '❤️', count: 1, reactedByMe: false },
    ]);
  });

  it('returns an empty array for no reactions', () => {
    expect(summarizeReactions([], 'me')).toEqual([]);
  });
});

describe('peer helpers', () => {
  it('derives a display name and initials', () => {
    expect(peerName({ displayName: 'Bjorn Iron', username: 'bjorn' })).toBe('Bjorn Iron');
    expect(peerName({ displayName: null, username: 'bjorn' })).toBe('bjorn');
    expect(peerInitials({ displayName: 'Bjorn Iron' })).toBe('BI');
    expect(peerInitials({ displayName: null, username: null })).toBe('?');
  });
});

describe('messagingErrorMessage', () => {
  it('collapses every availability/access cause into generic messages', () => {
    for (const category of [
      'conversation_unavailable',
      'messaging_unavailable',
      'action_not_permitted',
    ]) {
      expect(messagingErrorMessage(new MessagingApiError(category))).toBe(
        'Messaging is currently unavailable for this conversation.',
      );
    }
    for (const category of ['conversation_not_found', 'not_conversation_member']) {
      expect(messagingErrorMessage(new MessagingApiError(category))).toBe(
        'This conversation is unavailable.',
      );
    }
  });

  it('flags access errors distinctly from recoverable errors', () => {
    expect(isConversationAccessError(new MessagingApiError('conversation_not_found'))).toBe(true);
    expect(isConversationAccessError(new MessagingApiError('backend_unavailable'))).toBe(false);
  });
});
