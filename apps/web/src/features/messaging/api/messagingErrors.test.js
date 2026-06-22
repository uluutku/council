import { describe, expect, it } from 'vitest';
import { mapMessagingError } from './messagingErrors.js';

describe('mapMessagingError', () => {
  it.each([
    'conversation_unavailable',
    'conversation_not_found',
    'not_conversation_member',
    'messaging_unavailable',
    'message_not_found',
    'message_deleted',
    'message_not_editable',
    'invalid_message_content',
    'invalid_reply',
    'invalid_reaction',
    'idempotency_conflict',
    'invalid_cursor',
    'invalid_sequence',
    'action_not_permitted',
  ])('preserves the stable database category %s', (category) => {
    expect(mapMessagingError({ code: 'P0001', message: category })).toBe(category);
  });

  it('maps session failures without exposing provider detail', () => {
    expect(mapMessagingError({ code: 'PGRST301', message: 'JWT expired' })).toBe('session_expired');
  });

  it('maps rate limits and backend connectivity failures', () => {
    expect(mapMessagingError({ status: 429, message: 'too many requests' })).toBe('rate_limited');
    expect(mapMessagingError({ code: 'NETWORK_ERROR', message: 'failed' })).toBe(
      'backend_unavailable',
    );
  });

  it('does not pass unknown SQL text through as a category', () => {
    expect(
      mapMessagingError({
        code: 'XX000',
        message: 'internal SQL detail involving private message rows',
      }),
    ).toBe('unknown_error');
  });
});
