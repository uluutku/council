// Shared identifiers and factories for messaging tests. IDs are valid UUIDs so
// the shared Zod schemas accept them when fixtures flow through real query and
// cache code.

export const ME_ID = '11111111-1111-4111-8111-111111111111';
export const PEER_ID = '22222222-2222-4222-8222-222222222222';
export const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';

let messageCounter = 0;

export function resetMessageCounter() {
  messageCounter = 0;
}

export function makeMessage(overrides = {}) {
  messageCounter += 1;
  const index = messageCounter;
  return {
    id: `aaaaaaaa-0000-4000-8000-${String(index).padStart(12, '0')}`,
    conversation_id: CONVERSATION_ID,
    sequence: index,
    sender_user_id: ME_ID,
    content: `Message ${index}`,
    reply_to_message_id: null,
    created_at: '2026-06-22T10:00:00+00:00',
    edited_at: null,
    deleted_at: null,
    reactions: [],
    ...overrides,
  };
}

export function makeConversation(overrides = {}) {
  return {
    conversation_id: CONVERSATION_ID,
    conversation_type: 'direct',
    peer_id: PEER_ID,
    peer_username: 'bjorn',
    peer_display_name: 'Bjorn',
    peer_avatar_path: null,
    peer_status_text: null,
    last_message_id: null,
    last_message_content: null,
    last_message_deleted: false,
    last_message_sender_id: null,
    last_message_sequence: 0,
    last_message_at: null,
    last_read_sequence: 0,
    last_delivered_sequence: 0,
    unread_count: 0,
    can_send: true,
    updated_at: '2026-06-22T10:00:00+00:00',
    ...overrides,
  };
}

export function makeReceipt(overrides = {}) {
  return {
    conversation_id: CONVERSATION_ID,
    last_delivered_sequence: 0,
    last_read_sequence: 0,
    ...overrides,
  };
}
