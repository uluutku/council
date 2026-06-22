// Maps the stable messaging error categories (from messagingErrors.js) to fixed
// user-facing strings. Every category that could be caused by blocking, contact
// removal, or a privacy change collapses into the same generic message so the UI
// can never reveal whether a block exists or in which direction.

import { MessagingApiError } from './messagingErrors.js';

const GENERIC_UNAVAILABLE = 'Messaging is currently unavailable for this conversation.';
const GENERIC_CONVERSATION = 'This conversation is unavailable.';

const MESSAGES = {
  authentication_required: 'Your session has expired. Sign in again.',
  session_expired: 'Your session has expired. Sign in again.',
  rate_limited: 'Too many attempts. Wait briefly and try again.',
  backend_unavailable: 'Council is temporarily unavailable. Try again.',

  // Generic availability — never disclose blocking or contact state.
  conversation_unavailable: GENERIC_UNAVAILABLE,
  messaging_unavailable: GENERIC_UNAVAILABLE,
  action_not_permitted: GENERIC_UNAVAILABLE,

  // Generic access — never distinguish missing from inaccessible.
  conversation_not_found: GENERIC_CONVERSATION,
  not_conversation_member: GENERIC_CONVERSATION,

  // Message-level outcomes that are safe to describe precisely.
  message_not_found: 'That message is no longer available.',
  message_deleted: 'That message has been deleted.',
  message_not_editable: 'That message can no longer be edited.',
  invalid_message_content: 'Enter a message between 1 and 8000 characters.',
  invalid_reply: 'The message you replied to is no longer available.',
  invalid_reaction: 'That reaction could not be applied.',
  idempotency_conflict: 'That message was already sent.',
  invalid_cursor: 'Could not load more. Refresh and try again.',
  invalid_sequence: 'Could not update. Refresh and try again.',

  unknown_error: 'Something went wrong. Try again.',
};

export function messagingErrorMessage(error) {
  const category =
    error instanceof MessagingApiError ? error.category : (error?.category ?? 'unknown_error');
  return MESSAGES[category] ?? MESSAGES.unknown_error;
}

// True when an error means the conversation itself cannot be shown (access /
// existence), as opposed to a recoverable per-action failure.
export function isConversationAccessError(error) {
  const category = error instanceof MessagingApiError ? error.category : error?.category;
  return category === 'conversation_not_found' || category === 'not_conversation_member';
}
