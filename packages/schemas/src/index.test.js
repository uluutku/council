import { describe, expect, it } from 'vitest';
import {
  applicationConfigSchema,
  aiSendInputSchema,
  blockedUserItemSchema,
  contactActionResultSchema,
  contactListItemSchema,
  contactRequestDirectionSchema,
  contactRequestItemSchema,
  contactRequestResponseSchema,
  contactSearchFormSchema,
  conversationCursorSchema,
  conversationListItemSchema,
  conversationMemberReceiptSchema,
  conversationPageResponseSchema,
  conversationTypeSchema,
  deletedMessageSchema,
  directConversationResultSchema,
  editMessageInputSchema,
  emailSchema,
  forgotPasswordFormSchema,
  loginFormSchema,
  messagePageInputSchema,
  messagePageResponseSchema,
  messageSchema,
  messageCreatedEventSchema,
  messageDeletedEventSchema,
  messageEditedEventSchema,
  messagingErrorCategorySchema,
  messagingAvailabilityChangedEventSchema,
  notificationPreferencesSchema,
  passwordSchema,
  preferencesFormSchema,
  privacyPreferencesSchema,
  profileFormSchema,
  profileSearchQuerySchema,
  profileSearchResultSchema,
  profileUpdateInputSchema,
  publicProfileSchema,
  reactionInputSchema,
  reactionSchema,
  reactionChangedEventSchema,
  realtimeEventEnvelopeSchema,
  realtimeEventNameSchema,
  realtimeEventVersionSchema,
  realtimeSubscriptionStatusSchema,
  registrationFormSchema,
  relationshipStatusSchema,
  resetPasswordFormSchema,
  receiptUpdateSchema,
  receiptChangedEventSchema,
  sendMessageInputSchema,
  userSettingsUpdateSchema,
  usernameOnboardingSchema,
  usernameSchema,
  conversationChangedEventSchema,
  conversationCreatedEventSchema,
} from './index.js';

describe('aiSendInputSchema', () => {
  const conversationId = '10000000-0000-4000-8000-000000000001';
  const clientMessageId = '20000000-0000-4000-8000-000000000002';
  const sourceMessageId = '30000000-0000-4000-8000-000000000003';

  it('accepts a bounded text-only forwarded-context request with an optional instruction', () => {
    expect(
      aiSendInputSchema.parse({
        conversation_id: conversationId,
        client_message_id: clientMessageId,
        content: '',
        context_import: {
          source_conversation_id: conversationId,
          source_message_ids: [sourceMessageId],
        },
      }).context_import.source_message_ids,
    ).toEqual([sourceMessageId]);
  });

  it('rejects attachments and oversized instructions on forwarded context', () => {
    expect(
      aiSendInputSchema.safeParse({
        conversation_id: conversationId,
        client_message_id: clientMessageId,
        content: 'x'.repeat(2001),
        attachment_ids: [sourceMessageId],
        context_import: {
          source_conversation_id: conversationId,
          source_message_ids: [sourceMessageId],
        },
      }).success,
    ).toBe(false);
  });
});

describe('applicationConfigSchema', () => {
  it('accepts a complete browser-safe configuration', () => {
    const result = applicationConfigSchema.parse({
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: 'public-anon-key',
      mode: 'test',
    });

    expect(result.mode).toBe('test');
  });

  it('rejects unknown fields', () => {
    const result = applicationConfigSchema.safeParse({
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: 'public-anon-key',
      mode: 'test',
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });
});

describe('usernameSchema', () => {
  it('normalizes a valid username to lowercase', () => {
    expect(usernameSchema.parse('  Alice_01 ')).toBe('alice_01');
  });

  it.each(['ab', '_alice', 'alice-name', 'a'.repeat(25)])(
    'rejects the database-invalid username %s',
    (username) => {
      expect(usernameSchema.safeParse(username).success).toBe(false);
    },
  );
});

describe('profileUpdateInputSchema', () => {
  it('normalizes blank optional fields to null', () => {
    expect(
      profileUpdateInputSchema.parse({
        username: 'Council_User',
        display_name: ' ',
        bio: '',
        avatar_path: ' avatars/user/photo.webp ',
        status_text: null,
      }),
    ).toEqual({
      username: 'council_user',
      display_name: null,
      bio: null,
      avatar_path: 'avatars/user/photo.webp',
      status_text: null,
    });
  });

  it.each(['https://example.com/avatar.png', '/absolute/avatar.png', '../avatar.png'])(
    'rejects the non-relative avatar path %s',
    (avatarPath) => {
      const result = profileUpdateInputSchema.safeParse({
        username: null,
        display_name: null,
        bio: null,
        avatar_path: avatarPath,
        status_text: null,
      });

      expect(result.success).toBe(false);
    },
  );

  it('enforces profile field lengths', () => {
    const result = profileUpdateInputSchema.safeParse({
      username: null,
      display_name: 'd'.repeat(61),
      bio: 'b'.repeat(301),
      avatar_path: null,
      status_text: 's'.repeat(121),
    });

    expect(result.success).toBe(false);
  });
});

describe('social contract schemas', () => {
  it('validates a minimal public profile', () => {
    expect(
      publicProfileSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        username: 'alice',
        display_name: 'Alice',
        avatar_path: null,
        status_text: null,
        relationship_status: 'pending',
      }).username,
    ).toBe('alice');
  });

  it('validates relationship enums', () => {
    expect(relationshipStatusSchema.parse('accepted')).toBe('accepted');
    expect(contactRequestResponseSchema.parse('rejected')).toBe('rejected');
    expect(contactRequestDirectionSchema.parse('incoming')).toBe('incoming');
    expect(contactRequestResponseSchema.safeParse('ignored').success).toBe(false);
  });

  it('validates bounded profile searches and applies the default limit', () => {
    expect(profileSearchQuerySchema.parse({ query: ' al ' })).toEqual({
      query: 'al',
      result_limit: 20,
    });
    expect(profileSearchQuerySchema.safeParse({ query: 'a', result_limit: 20 }).success).toBe(
      false,
    );
    expect(profileSearchQuerySchema.safeParse({ query: 'alice', result_limit: 26 }).success).toBe(
      false,
    );
  });

  it('requires preference values to be JSON objects', () => {
    expect(
      userSettingsUpdateSchema.parse({
        privacy_preferences: { allow_contact_requests: false },
      }),
    ).toEqual({
      privacy_preferences: { allow_contact_requests: false },
    });
    expect(userSettingsUpdateSchema.safeParse({ notification_preferences: [] }).success).toBe(
      false,
    );
    expect(userSettingsUpdateSchema.safeParse({ ai_preferences: null }).success).toBe(false);
    expect(userSettingsUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe('authentication schemas', () => {
  it('normalizes email whitespace without changing password contents', () => {
    expect(
      loginFormSchema.parse({
        email: '  User@Example.com ',
        password: ' keep My Spaces ',
      }),
    ).toEqual({
      email: 'User@Example.com',
      password: ' keep My Spaces ',
    });
  });

  it.each(['invalid', '@example.com', 'user@'])('rejects invalid email %s', (email) => {
    expect(emailSchema.safeParse(email).success).toBe(false);
  });

  it('enforces a 10 to 128 character password without complexity rules', () => {
    expect(passwordSchema.parse('abcdefghij')).toBe('abcdefghij');
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });

  it('validates registration confirmation and acknowledgment', () => {
    const valid = {
      email: 'person@example.com',
      password: 'long-password',
      confirmPassword: 'long-password',
      acceptTerms: true,
    };

    expect(registrationFormSchema.parse(valid).email).toBe('person@example.com');
    expect(
      registrationFormSchema.safeParse({ ...valid, confirmPassword: 'different-password' }).success,
    ).toBe(false);
    expect(registrationFormSchema.safeParse({ ...valid, acceptTerms: false }).success).toBe(false);
  });

  it('validates forgot and reset password forms', () => {
    expect(forgotPasswordFormSchema.parse({ email: 'user@example.com' }).email).toBe(
      'user@example.com',
    );
    expect(
      resetPasswordFormSchema.safeParse({
        password: 'updated-password',
        confirmPassword: 'not-the-same',
      }).success,
    ).toBe(false);
  });
});

describe('account form schemas', () => {
  it('validates onboarding and profile fields consistently with the database', () => {
    expect(
      usernameOnboardingSchema.parse({
        username: ' New_User ',
        display_name: ' New User ',
      }),
    ).toEqual({
      username: 'new_user',
      display_name: 'New User',
    });

    expect(
      profileFormSchema.safeParse({
        username: '_invalid',
        display_name: null,
        bio: null,
        status_text: null,
      }).success,
    ).toBe(false);
  });

  it('requires complete strict notification and privacy preference objects', () => {
    expect(
      notificationPreferencesSchema.parse({
        message_notifications: true,
        message_previews: false,
        sound: true,
      }).sound,
    ).toBe(true);
    expect(
      privacyPreferencesSchema.safeParse({
        show_online_status: true,
        show_last_seen: true,
      }).success,
    ).toBe(false);
  });

  it('validates the complete preferences form', () => {
    expect(
      preferencesFormSchema.parse({
        theme: 'dark',
        notification_preferences: {
          message_notifications: true,
          message_previews: false,
          sound: true,
        },
        privacy_preferences: {
          show_online_status: true,
          show_last_seen: false,
          allow_contact_requests: true,
        },
      }).theme,
    ).toBe('dark');
  });
});

describe('contact and discovery contracts', () => {
  const uuidA = '11111111-1111-4111-8111-111111111111';
  const uuidB = '22222222-2222-4222-8222-222222222222';
  const ts = '2026-06-21T22:00:00+00:00';

  const baseDisplay = {
    id: uuidA,
    username: 'amelia',
    display_name: 'Amelia',
    avatar_path: null,
    status_text: 'Available',
  };

  it('parses a contact list item and normalizes nullable display fields', () => {
    const parsed = contactListItemSchema.parse({
      ...baseDisplay,
      display_name: '   ',
      status_text: '',
      relationship_id: uuidB,
      accepted_at: ts,
    });
    expect(parsed.display_name).toBeNull();
    expect(parsed.status_text).toBeNull();
    expect(parsed.relationship_id).toBe(uuidB);
  });

  it('rejects a contact list item with an invalid relationship UUID', () => {
    expect(
      contactListItemSchema.safeParse({
        ...baseDisplay,
        relationship_id: 'not-a-uuid',
        accepted_at: ts,
      }).success,
    ).toBe(false);
  });

  it('rejects a contact list item that leaks an email field', () => {
    expect(
      contactListItemSchema.safeParse({
        ...baseDisplay,
        relationship_id: uuidB,
        accepted_at: ts,
        email: 'leak@example.test',
      }).success,
    ).toBe(false);
  });

  it('rejects a contact list item missing the required id', () => {
    expect(
      contactListItemSchema.safeParse({
        username: 'amelia',
        display_name: 'Amelia',
        avatar_path: null,
        status_text: 'Available',
        relationship_id: uuidB,
        accepted_at: ts,
      }).success,
    ).toBe(false);
  });

  it('parses incoming and outgoing request items', () => {
    const incoming = contactRequestItemSchema.parse({
      relationship_id: uuidB,
      ...baseDisplay,
      direction: 'incoming',
      created_at: ts,
    });
    expect(incoming.direction).toBe('incoming');
  });

  it('rejects an invalid request direction', () => {
    expect(
      contactRequestItemSchema.safeParse({
        relationship_id: uuidB,
        ...baseDisplay,
        direction: 'sideways',
        created_at: ts,
      }).success,
    ).toBe(false);
  });

  it('parses a profile search result with a relationship status', () => {
    const parsed = profileSearchResultSchema.parse({
      ...baseDisplay,
      relationship_status: 'pending',
    });
    expect(parsed.relationship_status).toBe('pending');
  });

  it('rejects a profile search result with an invalid relationship status', () => {
    expect(
      profileSearchResultSchema.safeParse({
        ...baseDisplay,
        relationship_status: 'archived',
      }).success,
    ).toBe(false);
  });

  it('parses a blocked-user item with a blocked timestamp', () => {
    const parsed = blockedUserItemSchema.parse({ ...baseDisplay, blocked_at: ts });
    expect(parsed.blocked_at).toBe(ts);
  });

  it('rejects a blocked-user item with an invalid timestamp', () => {
    expect(
      blockedUserItemSchema.safeParse({ ...baseDisplay, blocked_at: 'yesterday' }).success,
    ).toBe(false);
  });

  it('validates a relationship status enum', () => {
    expect(relationshipStatusSchema.parse('accepted')).toBe('accepted');
    expect(relationshipStatusSchema.safeParse('blocked').success).toBe(false);
  });

  it('validates a request direction enum', () => {
    expect(contactRequestDirectionSchema.parse('outgoing')).toBe('outgoing');
    expect(contactRequestDirectionSchema.safeParse('inbound').success).toBe(false);
  });

  it('parses a normalized contact action result', () => {
    const relationship = {
      id: uuidB,
      user_low_id: uuidA,
      user_high_id: uuidB,
      requested_by: uuidA,
      status: 'pending',
      created_at: ts,
      responded_at: null,
      updated_at: ts,
    };
    const parsed = contactActionResultSchema.parse({ outcome: 'request_sent', relationship });
    expect(parsed.outcome).toBe('request_sent');
    expect(parsed.relationship.status).toBe('pending');
  });

  it('rejects a contact action result with an unknown outcome', () => {
    expect(
      contactActionResultSchema.safeParse({
        outcome: 'cancelled',
        relationship: {
          id: uuidB,
          user_low_id: uuidA,
          user_high_id: uuidB,
          requested_by: uuidA,
          status: 'pending',
          created_at: ts,
          responded_at: null,
          updated_at: ts,
        },
      }).success,
    ).toBe(false);
  });

  it('accepts a short or empty contact search form value', () => {
    expect(contactSearchFormSchema.parse({ query: '' }).query).toBe('');
    expect(contactSearchFormSchema.parse({ query: 'a' }).query).toBe('a');
  });

  it('rejects an over-long contact search form value', () => {
    expect(contactSearchFormSchema.safeParse({ query: 'a'.repeat(101) }).success).toBe(false);
  });
});

describe('conversation and messaging contracts', () => {
  const conversationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const messageId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const senderId = '11111111-1111-4111-8111-111111111111';
  const peerId = '22222222-2222-4222-8222-222222222222';
  const clientMessageId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const timestamp = '2026-06-22T12:00:00+00:00';

  const activeMessage = {
    id: messageId,
    conversation_id: conversationId,
    sequence: 1,
    sender_user_id: senderId,
    content: 'Hello',
    reply_to_message_id: null,
    created_at: timestamp,
    edited_at: null,
    deleted_at: null,
    reactions: [],
  };

  const conversation = {
    conversation_id: conversationId,
    conversation_type: 'direct',
    peer_id: peerId,
    peer_username: 'peer_user',
    peer_display_name: 'Peer User',
    peer_avatar_path: null,
    peer_status_text: null,
    last_message_id: messageId,
    last_message_content: 'Hello',
    last_message_deleted: false,
    last_message_sender_id: senderId,
    last_message_sequence: 1,
    last_message_at: timestamp,
    last_read_sequence: 0,
    last_delivered_sequence: 0,
    unread_count: 1,
    can_send: true,
    updated_at: timestamp,
  };

  it('accepts only the direct conversation type', () => {
    expect(conversationTypeSchema.parse('direct')).toBe('direct');
    expect(conversationTypeSchema.safeParse('group').success).toBe(false);
  });

  it('validates the minimal create-or-get result', () => {
    expect(
      directConversationResultSchema.parse({
        conversation_id: conversationId,
        conversation_type: 'direct',
        created_at: timestamp,
        updated_at: timestamp,
        can_send: true,
      }).conversation_id,
    ).toBe(conversationId);
  });

  it('rejects private fields from direct conversation results', () => {
    expect(
      directConversationResultSchema.safeParse({
        conversation_id: conversationId,
        conversation_type: 'direct',
        created_at: timestamp,
        updated_at: timestamp,
        can_send: true,
        email: 'private@example.test',
      }).success,
    ).toBe(false);
  });

  it('validates active messages', () => {
    expect(messageSchema.parse(activeMessage).content).toBe('Hello');
    expect(messageSchema.safeParse({ ...activeMessage, sequence: 0 }).success).toBe(false);
    expect(messageSchema.safeParse({ ...activeMessage, content: null }).success).toBe(false);
  });

  it('requires deleted messages to be content-free tombstones', () => {
    const tombstone = {
      ...activeMessage,
      content: null,
      deleted_at: timestamp,
    };

    expect(deletedMessageSchema.parse(tombstone).content).toBeNull();
    expect(messageSchema.safeParse({ ...tombstone, content: 'leaked deleted text' }).success).toBe(
      false,
    );
    expect(deletedMessageSchema.safeParse(activeMessage).success).toBe(false);
  });

  it('validates bounded strict reactions', () => {
    const reaction = {
      message_id: messageId,
      user_id: peerId,
      emoji: '👍',
      created_at: timestamp,
    };

    expect(reactionSchema.parse(reaction).emoji).toBe('👍');
    expect(reactionSchema.safeParse({ ...reaction, emoji: ' ' }).success).toBe(false);
    expect(
      reactionSchema.safeParse({
        ...reaction,
        email: 'private@example.test',
      }).success,
    ).toBe(false);
  });

  it('supports nullable peer profile fields without accepting private data', () => {
    const hiddenPeer = {
      ...conversation,
      peer_username: null,
      peer_display_name: null,
      peer_avatar_path: null,
      peer_status_text: null,
    };

    expect(conversationListItemSchema.parse(hiddenPeer).peer_username).toBeNull();
    expect(
      conversationListItemSchema.safeParse({
        ...hiddenPeer,
        bio: 'private',
      }).success,
    ).toBe(false);
  });

  it('rejects deleted previews that contain content', () => {
    expect(
      conversationListItemSchema.safeParse({
        ...conversation,
        last_message_deleted: true,
        last_message_content: 'must not leak',
      }).success,
    ).toBe(false);
  });

  it('validates conversation receipt ordering', () => {
    expect(
      conversationMemberReceiptSchema.parse({
        conversation_id: conversationId,
        last_delivered_sequence: 4,
        last_read_sequence: 3,
      }).last_read_sequence,
    ).toBe(3);
    expect(
      conversationMemberReceiptSchema.safeParse({
        conversation_id: conversationId,
        last_delivered_sequence: 2,
        last_read_sequence: 3,
      }).success,
    ).toBe(false);
  });

  it('validates stable paired conversation cursors', () => {
    expect(conversationCursorSchema.parse({})).toEqual({
      result_limit: 30,
      cursor_updated_at: null,
      cursor_id: null,
    });
    expect(
      conversationCursorSchema.safeParse({
        result_limit: 20,
        cursor_updated_at: timestamp,
        cursor_id: null,
      }).success,
    ).toBe(false);
    expect(conversationCursorSchema.safeParse({ result_limit: 51 }).success).toBe(false);
  });

  it('validates bounded message page input', () => {
    expect(messagePageInputSchema.parse({ conversation_id: conversationId })).toEqual({
      conversation_id: conversationId,
      before_sequence: null,
      result_limit: 50,
    });
    expect(
      messagePageInputSchema.safeParse({
        conversation_id: conversationId,
        before_sequence: 0,
      }).success,
    ).toBe(false);
    expect(
      messagePageInputSchema.safeParse({
        conversation_id: conversationId,
        result_limit: 101,
      }).success,
    ).toBe(false);
  });

  it('normalizes and bounds send and edit inputs', () => {
    expect(
      sendMessageInputSchema.parse({
        conversation_id: conversationId,
        client_message_id: clientMessageId,
        content: '  hello  ',
      }),
    ).toEqual({
      conversation_id: conversationId,
      client_message_id: clientMessageId,
      content: 'hello',
      reply_to_message_id: null,
      attachment_ids: [],
    });
    expect(
      editMessageInputSchema.safeParse({
        message_id: messageId,
        content: ' ',
      }).success,
    ).toBe(false);
  });

  it('validates reaction and receipt update inputs', () => {
    expect(reactionInputSchema.parse({ message_id: messageId, emoji: ' 👍 ' }).emoji).toBe('👍');
    expect(
      receiptUpdateSchema.parse({
        conversation_id: conversationId,
        through_sequence: 0,
      }).through_sequence,
    ).toBe(0);
    expect(
      receiptUpdateSchema.safeParse({
        conversation_id: conversationId,
        through_sequence: -1,
      }).success,
    ).toBe(false);
  });

  it('validates message and conversation page responses', () => {
    expect(messagePageResponseSchema.parse([activeMessage])).toHaveLength(1);
    expect(conversationPageResponseSchema.parse([conversation])).toHaveLength(1);
    expect(
      messagePageResponseSchema.safeParse([{ ...activeMessage, authentication_token: 'leak' }])
        .success,
    ).toBe(false);
  });

  it('enumerates stable messaging error categories', () => {
    expect(messagingErrorCategorySchema.parse('idempotency_conflict')).toBe('idempotency_conflict');
    expect(messagingErrorCategorySchema.safeParse('raw_sql_error').success).toBe(false);
  });
});

describe('Realtime event contracts', () => {
  const eventId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const conversationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const entityId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const actorId = '11111111-1111-4111-8111-111111111111';
  const occurredAt = '2026-06-22T19:00:00+00:00';
  const base = { id: eventId, version: 1, occurred_at: occurredAt };

  it('accepts the supported version, event names, and statuses only', () => {
    expect(realtimeEventVersionSchema.parse(1)).toBe(1);
    expect(realtimeEventVersionSchema.safeParse(2).success).toBe(false);
    expect(realtimeEventNameSchema.parse('message.created')).toBe('message.created');
    expect(realtimeEventNameSchema.safeParse('message.content').success).toBe(false);
    expect(realtimeSubscriptionStatusSchema.parse('reconnecting')).toBe('reconnecting');
    expect(realtimeSubscriptionStatusSchema.safeParse('open').success).toBe(false);
  });

  it('validates all message event variants without content', () => {
    const fields = {
      ...base,
      conversation_id: conversationId,
      entity_id: entityId,
      sequence: 4,
      actor_user_id: actorId,
      last_sequence: 4,
    };

    expect(messageCreatedEventSchema.parse({ ...fields, event: 'message.created' }).sequence).toBe(
      4,
    );
    expect(messageEditedEventSchema.parse({ ...fields, event: 'message.edited' }).event).toBe(
      'message.edited',
    );
    expect(messageDeletedEventSchema.parse({ ...fields, event: 'message.deleted' }).event).toBe(
      'message.deleted',
    );
    expect(
      messageCreatedEventSchema.safeParse({
        ...fields,
        event: 'message.created',
        content: 'private',
      }).success,
    ).toBe(false);
  });

  it('validates reaction events and rejects reaction values', () => {
    const event = {
      ...base,
      event: 'reaction.changed',
      conversation_id: conversationId,
      entity_id: entityId,
      actor_user_id: actorId,
    };
    expect(reactionChangedEventSchema.parse(event).entity_id).toBe(entityId);
    expect(reactionChangedEventSchema.safeParse({ ...event, emoji: '👍' }).success).toBe(false);
  });

  it('validates coherent receipt events', () => {
    const event = {
      ...base,
      event: 'receipt.changed',
      conversation_id: conversationId,
      entity_id: actorId,
      actor_user_id: actorId,
      read_sequence: 3,
      delivered_sequence: 4,
    };
    expect(receiptChangedEventSchema.parse(event).read_sequence).toBe(3);
    expect(
      receiptChangedEventSchema.safeParse({
        ...event,
        read_sequence: 5,
        delivered_sequence: 4,
      }).success,
    ).toBe(false);
  });

  it('validates inbox conversation events', () => {
    expect(
      conversationCreatedEventSchema.parse({
        ...base,
        event: 'conversation.created',
        conversation_id: conversationId,
      }).conversation_id,
    ).toBe(conversationId);
    expect(
      conversationChangedEventSchema.parse({
        ...base,
        event: 'conversation.changed',
        conversation_id: conversationId,
        last_sequence: 8,
      }).last_sequence,
    ).toBe(8);
  });

  it('rejects availability causes, actors, and block direction', () => {
    const event = {
      ...base,
      event: 'messaging.availability_changed',
      conversation_id: conversationId,
    };
    expect(messagingAvailabilityChangedEventSchema.parse(event).event).toBe(
      'messaging.availability_changed',
    );
    expect(
      messagingAvailabilityChangedEventSchema.safeParse({
        ...event,
        cause: 'blocked',
        actor_user_id: actorId,
      }).success,
    ).toBe(false);
  });

  it('rejects malformed envelope fields and unknown sensitive metadata', () => {
    expect(
      realtimeEventEnvelopeSchema.safeParse({
        ...base,
        event: 'conversation.created',
        conversation_id: 'not-a-uuid',
      }).success,
    ).toBe(false);
    expect(
      realtimeEventEnvelopeSchema.safeParse({
        ...base,
        event: 'conversation.created',
        conversation_id: conversationId,
        email: 'private@example.test',
      }).success,
    ).toBe(false);
    expect(
      realtimeEventEnvelopeSchema.safeParse({
        ...base,
        event: 'unknown.event',
        conversation_id: conversationId,
      }).success,
    ).toBe(false);
    expect(
      realtimeEventEnvelopeSchema.safeParse({
        ...base,
        occurred_at: 'yesterday',
        event: 'conversation.created',
        conversation_id: conversationId,
      }).success,
    ).toBe(false);
  });
});
