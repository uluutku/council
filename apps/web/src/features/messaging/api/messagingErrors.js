const DATABASE_CATEGORIES = new Set([
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
]);

/**
 * Maps provider/database failures to a stable application category without
 * exposing SQL details, UUIDs, block direction, or private message content.
 *
 * @param {{code?: string, message?: string, status?: number} | null | undefined} error
 */
export function mapMessagingError(error) {
  const message = typeof error?.message === 'string' ? error.message : '';

  if (DATABASE_CATEGORIES.has(message)) {
    return message;
  }

  if (error?.code === 'PGRST301' || /jwt|session|authentication required/i.test(message)) {
    return 'session_expired';
  }

  if (error?.status === 429 || error?.code === '429' || /rate limit/i.test(message)) {
    return 'rate_limited';
  }

  if (
    error?.code === 'NETWORK_ERROR' ||
    error?.code === 'ECONNREFUSED' ||
    /failed to fetch|network|timeout/i.test(message)
  ) {
    return 'backend_unavailable';
  }

  return 'unknown_error';
}

export class MessagingApiError extends Error {
  constructor(category, cause) {
    super(category, { cause });
    this.name = 'MessagingApiError';
    this.category = category;
  }
}

export function toMessagingApiError(error) {
  return new MessagingApiError(mapMessagingError(error), error);
}
