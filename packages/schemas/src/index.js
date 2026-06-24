import { z } from 'zod';

export const applicationConfigSchema = z
  .object({
    supabaseUrl: z.string().url('Public API URL must be a valid URL.'),
    supabaseAnonKey: z.string().min(1, 'Public anon key is required.'),
    mode: z.enum(['development', 'test', 'production']),
  })
  .strict();

export const usernameSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z
    .string()
    .min(3, 'Username must contain at least 3 characters.')
    .max(24, 'Username must contain at most 24 characters.')
    .regex(
      /^[a-z0-9][a-z0-9_]{2,23}$/,
      'Username may contain lowercase letters, numbers, and underscores and must start with a letter or number.',
    ),
);

function nullableTrimmedString(maximumLength, fieldName) {
  return z.preprocess(
    (value) => {
      if (typeof value !== 'string') {
        return value;
      }

      const normalized = value.trim();
      return normalized === '' ? null : normalized;
    },
    z.string().max(maximumLength, `${fieldName} is too long.`).nullable(),
  );
}

export const avatarPathSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const normalized = value.trim();
    return normalized === '' ? null : normalized;
  },
  z
    .string()
    .max(512, 'Avatar path is too long.')
    .refine((value) => !/^[\\/]/.test(value), 'Avatar path must be Storage-relative.')
    .refine((value) => !/^[a-z][a-z0-9+.-]*:/i.test(value), 'Avatar path cannot be a URL.')
    .refine(
      (value) => !/(^|[\\/])\.\.([\\/]|$)/.test(value),
      'Avatar path cannot contain parent traversal.',
    )
    .refine(
      (value) =>
        !Array.from(value).some((character) => {
          const codePoint = character.codePointAt(0);
          return codePoint < 32 || codePoint === 127;
        }),
      'Avatar path is invalid.',
    )
    .nullable(),
);

export const relationshipStatusSchema = z.enum(['pending', 'accepted', 'rejected']);
export const contactRequestResponseSchema = z.enum(['accepted', 'rejected']);
export const contactRequestDirectionSchema = z.enum(['incoming', 'outgoing']);

export const profileUpdateInputSchema = z
  .object({
    username: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      usernameSchema.nullable(),
    ),
    display_name: nullableTrimmedString(60, 'Display name'),
    bio: nullableTrimmedString(300, 'Biography'),
    avatar_path: avatarPathSchema,
    status_text: nullableTrimmedString(120, 'Status text'),
  })
  .strict();

export const publicProfileSchema = z
  .object({
    id: z.string().uuid(),
    username: usernameSchema,
    display_name: nullableTrimmedString(60, 'Display name'),
    avatar_path: avatarPathSchema,
    status_text: nullableTrimmedString(120, 'Status text'),
    relationship_status: relationshipStatusSchema.nullable(),
  })
  .strict();

const preferenceObjectSchema = z.record(z.string(), z.unknown());

export const userSettingsUpdateSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']).optional(),
    notification_preferences: preferenceObjectSchema.optional(),
    privacy_preferences: preferenceObjectSchema.optional(),
    ai_preferences: preferenceObjectSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one settings field is required.');

export const profileSearchQuerySchema = z
  .object({
    query: z.string().trim().min(2).max(100),
    result_limit: z.number().int().min(1).max(25).default(20),
  })
  .strict();

const timestampSchema = z
  .string()
  .datetime({ offset: true, message: 'Expected an ISO 8601 timestamp.' });

export const contactRelationshipSchema = z
  .object({
    id: z.string().uuid(),
    user_low_id: z.string().uuid(),
    user_high_id: z.string().uuid(),
    requested_by: z.string().uuid(),
    status: relationshipStatusSchema,
    created_at: timestampSchema,
    responded_at: timestampSchema.nullable(),
    updated_at: timestampSchema,
  })
  .strict();

export const contactListItemSchema = z
  .object({
    id: z.string().uuid(),
    username: usernameSchema,
    display_name: nullableTrimmedString(60, 'Display name'),
    avatar_path: avatarPathSchema,
    status_text: nullableTrimmedString(120, 'Status text'),
    relationship_id: z.string().uuid(),
    accepted_at: timestampSchema.nullable(),
  })
  .strict();

export const contactListSchema = z.array(contactListItemSchema);

export const contactRequestItemSchema = z
  .object({
    relationship_id: z.string().uuid(),
    id: z.string().uuid(),
    username: usernameSchema,
    display_name: nullableTrimmedString(60, 'Display name'),
    avatar_path: avatarPathSchema,
    status_text: nullableTrimmedString(120, 'Status text'),
    direction: contactRequestDirectionSchema,
    created_at: timestampSchema,
  })
  .strict();

export const contactRequestListSchema = z.array(contactRequestItemSchema);

export const profileSearchResultSchema = publicProfileSchema;
export const profileSearchResultsSchema = z.array(profileSearchResultSchema);

export const blockedUserItemSchema = z
  .object({
    id: z.string().uuid(),
    username: usernameSchema,
    display_name: nullableTrimmedString(60, 'Display name'),
    avatar_path: avatarPathSchema,
    status_text: nullableTrimmedString(120, 'Status text'),
    blocked_at: timestampSchema,
  })
  .strict();

export const blockedUserListSchema = z.array(blockedUserItemSchema);

export const contactActionOutcomeSchema = z.enum([
  'request_sent',
  'now_contacts',
  'already_contacts',
]);

export const contactActionResultSchema = z
  .object({
    outcome: contactActionOutcomeSchema,
    relationship: contactRelationshipSchema,
  })
  .strict();

export const contactSearchFormSchema = z
  .object({
    query: z.string().max(100, 'Search is limited to 100 characters.'),
  })
  .strict();

export const conversationTypeSchema = z.literal('direct');

const uuidSchema = z.string().uuid();
const positiveSequenceSchema = z.number().int().positive();
const nonnegativeSequenceSchema = z.number().int().nonnegative();
export const realtimeUuidSchema = uuidSchema;

export const directConversationResultSchema = z
  .object({
    conversation_id: uuidSchema,
    conversation_type: conversationTypeSchema,
    created_at: timestampSchema,
    updated_at: timestampSchema,
    can_send: z.boolean(),
  })
  .strict();

export const createDirectConversationInputSchema = z
  .object({
    target_user_id: uuidSchema,
  })
  .strict();

export const reactionSchema = z
  .object({
    message_id: uuidSchema,
    user_id: uuidSchema,
    emoji: z.string().trim().min(1).max(32),
    created_at: timestampSchema,
  })
  .strict();

// Private message attachments. Limits are conservative and enforced both in the
// browser and the database. The extension allowlist guards against a renamed
// executable declaring a supported MIME type.
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const supportedAttachmentTypes = Object.freeze({
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'application/pdf': ['pdf'],
  'text/plain': ['txt'],
  'text/markdown': ['md', 'markdown'],
});

export const attachmentMimeTypeSchema = z.enum(
  /** @type {[string, ...string[]]} */ (Object.keys(supportedAttachmentTypes)),
);

export function isImageMimeType(mimeType) {
  return (
    typeof mimeType === 'string' &&
    mimeType.startsWith('image/') &&
    mimeType in supportedAttachmentTypes
  );
}

export function attachmentExtension(filename) {
  if (typeof filename !== 'string') return null;
  const match = /\.([^.\\/]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : null;
}

export function isSupportedAttachment(mimeType, filename) {
  const extensions = supportedAttachmentTypes[mimeType];
  if (!extensions) return false;
  const extension = attachmentExtension(filename);
  return extension !== null && extensions.includes(extension);
}

export const attachmentStoragePathSchema = z
  .string()
  .min(1)
  .max(512, 'Attachment path is too long.')
  .refine((value) => !/^[\\/]/.test(value), 'Attachment path must be Storage-relative.')
  .refine((value) => !/^[a-z][a-z0-9+.-]*:/i.test(value), 'Attachment path cannot be a URL.')
  .refine(
    (value) => !/(^|[\\/])\.\.([\\/]|$)/.test(value),
    'Attachment path cannot contain parent traversal.',
  )
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint < 32 || codePoint === 127;
      }),
    'Attachment path is invalid.',
  );

export const attachmentSchema = z
  .object({
    id: uuidSchema,
    storage_bucket: z.literal('message-attachments'),
    storage_path: attachmentStoragePathSchema,
    original_filename: z.string().min(1).max(255),
    mime_type: attachmentMimeTypeSchema,
    size_bytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    created_at: timestampSchema,
  })
  .strict();

export const messageSchema = z
  .object({
    id: uuidSchema,
    conversation_id: uuidSchema,
    sequence: positiveSequenceSchema,
    sender_user_id: uuidSchema,
    content: z.string().min(1).max(8000).nullable(),
    reply_to_message_id: uuidSchema.nullable(),
    created_at: timestampSchema,
    edited_at: timestampSchema.nullable(),
    deleted_at: timestampSchema.nullable(),
    reactions: z.array(reactionSchema),
    attachments: z.array(attachmentSchema).default([]),
  })
  .strict()
  .superRefine((message, context) => {
    if (
      message.deleted_at === null &&
      message.content === null &&
      message.attachments.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['content'],
        message: 'Active messages require content or an attachment.',
      });
    }

    if (message.deleted_at !== null && message.content !== null) {
      context.addIssue({
        code: 'custom',
        path: ['content'],
        message: 'Deleted messages cannot contain content.',
      });
    }

    if (message.deleted_at !== null && message.attachments.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['attachments'],
        message: 'Deleted messages cannot retain attachments.',
      });
    }
  });

export const createAttachmentUploadInputSchema = z
  .object({
    conversation_id: uuidSchema,
    original_filename: z.string().trim().min(1).max(255),
    mime_type: attachmentMimeTypeSchema,
    size_bytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  })
  .strict();

export const attachmentUploadTargetSchema = z
  .object({
    attachment_id: uuidSchema,
    storage_bucket: z.literal('message-attachments'),
    storage_path: attachmentStoragePathSchema,
  })
  .strict();

export const finalizeAttachmentInputSchema = z
  .object({
    attachment_id: uuidSchema,
    width: z.number().int().positive().nullable().default(null),
    height: z.number().int().positive().nullable().default(null),
  })
  .strict();

export const finalizedAttachmentSchema = z
  .object({
    attachment_id: uuidSchema,
    status: z.enum(['pending', 'ready', 'attached']),
    mime_type: attachmentMimeTypeSchema,
    size_bytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
    original_filename: z.string().min(1).max(255),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
  })
  .strict();

export const deletedMessageSchema = messageSchema.refine(
  (message) => message.deleted_at !== null && message.content === null,
  'Expected a deleted-message tombstone.',
);

export const deletedConversationSchema = z
  .object({
    conversation_id: uuidSchema,
    deleted_at: timestampSchema,
    deleted_through_sequence: nonnegativeSequenceSchema,
  })
  .strict();

export const conversationListItemSchema = z
  .object({
    conversation_id: uuidSchema,
    conversation_type: conversationTypeSchema,
    peer_id: uuidSchema,
    peer_username: usernameSchema.nullable(),
    peer_display_name: nullableTrimmedString(60, 'Display name'),
    peer_avatar_path: avatarPathSchema,
    peer_status_text: nullableTrimmedString(120, 'Status text'),
    last_message_id: uuidSchema.nullable(),
    last_message_content: z.string().min(1).max(8000).nullable(),
    last_message_deleted: z.boolean(),
    last_message_sender_id: uuidSchema.nullable(),
    last_message_sequence: nonnegativeSequenceSchema,
    last_message_at: timestampSchema.nullable(),
    last_read_sequence: nonnegativeSequenceSchema,
    last_delivered_sequence: nonnegativeSequenceSchema,
    unread_count: nonnegativeSequenceSchema,
    can_send: z.boolean(),
    updated_at: timestampSchema,
    muted_until: timestampSchema.nullable().default(null),
    muted_forever: z.boolean().default(false),
    is_muted: z.boolean().default(false),
  })
  .strict()
  .superRefine((conversation, context) => {
    if (conversation.last_message_deleted && conversation.last_message_content !== null) {
      context.addIssue({
        code: 'custom',
        path: ['last_message_content'],
        message: 'Deleted message previews cannot contain content.',
      });
    }

    if (conversation.last_read_sequence > conversation.last_delivered_sequence) {
      context.addIssue({
        code: 'custom',
        path: ['last_read_sequence'],
        message: 'Read sequence cannot exceed delivered sequence.',
      });
    }
  });

export const conversationCursorSchema = z
  .object({
    result_limit: z.number().int().min(1).max(50).default(30),
    cursor_updated_at: timestampSchema.nullable().default(null),
    cursor_id: uuidSchema.nullable().default(null),
  })
  .strict()
  .refine(
    (cursor) => (cursor.cursor_updated_at === null) === (cursor.cursor_id === null),
    'Conversation cursor timestamp and ID must be provided together.',
  );

export const conversationPageResponseSchema = z.array(conversationListItemSchema);

export const conversationMemberReceiptSchema = z
  .object({
    conversation_id: uuidSchema,
    last_delivered_sequence: nonnegativeSequenceSchema,
    last_read_sequence: nonnegativeSequenceSchema,
  })
  .strict()
  .refine(
    (receipt) => receipt.last_read_sequence <= receipt.last_delivered_sequence,
    'Read sequence cannot exceed delivered sequence.',
  );

export const sendMessageInputSchema = z
  .object({
    conversation_id: uuidSchema,
    client_message_id: uuidSchema,
    content: z.preprocess((value) => {
      if (typeof value !== 'string') return value ?? null;
      const normalized = value.trim();
      return normalized === '' ? null : normalized;
    }, z.string().min(1).max(8000).nullable()),
    reply_to_message_id: uuidSchema.nullable().default(null),
    attachment_ids: z.array(uuidSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.content === null && value.attachment_ids.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['content'],
        message: 'A message needs text or at least one attachment.',
      });
    }
  });

export const editMessageInputSchema = z
  .object({
    message_id: uuidSchema,
    content: z.string().trim().min(1).max(8000),
  })
  .strict();

export const messageActionInputSchema = z
  .object({
    message_id: uuidSchema,
  })
  .strict();

export const messagePageInputSchema = z
  .object({
    conversation_id: uuidSchema,
    before_sequence: positiveSequenceSchema.nullable().default(null),
    result_limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();

export const messagePageResponseSchema = z.array(messageSchema);

export const receiptUpdateSchema = z
  .object({
    conversation_id: uuidSchema,
    through_sequence: nonnegativeSequenceSchema,
  })
  .strict();

export const reactionInputSchema = z
  .object({
    message_id: uuidSchema,
    emoji: z.string().trim().min(1).max(32),
  })
  .strict();

export const messagingErrorCategorySchema = z.enum([
  'authentication_required',
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
  'invalid_attachment',
  'unsupported_attachment_type',
  'attachment_too_large',
  'too_many_attachments',
  'attachment_not_found',
  'attachment_not_ready',
  'attachment_not_uploaded',
  'session_expired',
  'rate_limited',
  'backend_unavailable',
  'unknown_error',
]);

export const realtimeEventVersionSchema = z.literal(1);
export const realtimeEventNameSchema = z.enum([
  'message.created',
  'message.incoming',
  'message.edited',
  'message.deleted',
  'reaction.changed',
  'receipt.changed',
  'messaging.availability_changed',
  'conversation.created',
  'conversation.changed',
]);
export const realtimeSubscriptionStatusSchema = z.enum([
  'connecting',
  'subscribed',
  'reconnecting',
  'closed',
  'channel_error',
  'timed_out',
]);

const realtimeEventBaseShape = {
  id: uuidSchema,
  version: realtimeEventVersionSchema,
  occurred_at: timestampSchema,
};

export const messageCreatedEventSchema = z
  .object({
    ...realtimeEventBaseShape,
    event: z.literal('message.created'),
    conversation_id: uuidSchema,
    entity_id: uuidSchema,
    sequence: positiveSequenceSchema,
    actor_user_id: uuidSchema,
    last_sequence: positiveSequenceSchema,
  })
  .strict();

export const messageEditedEventSchema = z
  .object({
    ...realtimeEventBaseShape,
    event: z.literal('message.edited'),
    conversation_id: uuidSchema,
    entity_id: uuidSchema,
    sequence: positiveSequenceSchema,
    actor_user_id: uuidSchema,
    last_sequence: positiveSequenceSchema,
  })
  .strict();

export const messageIncomingEventSchema = z
  .object({
    ...realtimeEventBaseShape,
    event: z.literal('message.incoming'),
    conversation_id: uuidSchema,
    entity_id: uuidSchema,
    sequence: positiveSequenceSchema,
    actor_user_id: uuidSchema,
    last_sequence: positiveSequenceSchema,
  })
  .strict();

export const messageDeletedEventSchema = z
  .object({
    ...realtimeEventBaseShape,
    event: z.literal('message.deleted'),
    conversation_id: uuidSchema,
    entity_id: uuidSchema,
    sequence: positiveSequenceSchema,
    actor_user_id: uuidSchema,
    last_sequence: positiveSequenceSchema,
  })
  .strict();

export const reactionChangedEventSchema = z
  .object({
    ...realtimeEventBaseShape,
    event: z.literal('reaction.changed'),
    conversation_id: uuidSchema,
    entity_id: uuidSchema,
    actor_user_id: uuidSchema,
  })
  .strict();

export const receiptChangedEventSchema = z
  .object({
    ...realtimeEventBaseShape,
    event: z.literal('receipt.changed'),
    conversation_id: uuidSchema,
    entity_id: uuidSchema,
    actor_user_id: uuidSchema,
    read_sequence: nonnegativeSequenceSchema,
    delivered_sequence: nonnegativeSequenceSchema,
  })
  .strict()
  .refine(
    (event) => event.read_sequence <= event.delivered_sequence,
    'Realtime read sequence cannot exceed delivered sequence.',
  );

export const conversationCreatedEventSchema = z
  .object({
    ...realtimeEventBaseShape,
    event: z.literal('conversation.created'),
    conversation_id: uuidSchema,
  })
  .strict();

export const conversationChangedEventSchema = z
  .object({
    ...realtimeEventBaseShape,
    event: z.literal('conversation.changed'),
    conversation_id: uuidSchema,
    last_sequence: positiveSequenceSchema,
  })
  .strict();

export const messagingAvailabilityChangedEventSchema = z
  .object({
    ...realtimeEventBaseShape,
    event: z.literal('messaging.availability_changed'),
    conversation_id: uuidSchema,
  })
  .strict();

export const realtimeEventEnvelopeSchema = z.discriminatedUnion('event', [
  messageCreatedEventSchema,
  messageIncomingEventSchema,
  messageEditedEventSchema,
  messageDeletedEventSchema,
  reactionChangedEventSchema,
  receiptChangedEventSchema,
  conversationCreatedEventSchema,
  conversationChangedEventSchema,
  messagingAvailabilityChangedEventSchema,
]);

export const typingEventSchema = z
  .object({
    version: z.literal(1),
    event: z.enum(['typing.start', 'typing.stop']),
    sent_at: timestampSchema,
  })
  .strict();

export const conversationMuteInputSchema = z
  .object({
    conversation_id: uuidSchema,
    duration_seconds: z.union([z.literal(3600), z.literal(28800), z.literal(604800)]).nullable(),
    forever: z.boolean(),
  })
  .strict()
  .refine((value) => !(value.forever && value.duration_seconds !== null));

export const conversationMuteSchema = z
  .object({
    conversation_id: uuidSchema,
    muted_until: timestampSchema.nullable(),
    muted_forever: z.boolean(),
    is_muted: z.boolean(),
  })
  .strict();

export const presenceSchema = z
  .object({
    user_id: uuidSchema,
    is_online: z.boolean().nullable(),
    last_seen_at: timestampSchema.nullable(),
  })
  .strict();
export const presenceListSchema = z.array(presenceSchema);

export const conversationSearchResultSchema = z
  .object({
    conversation_id: uuidSchema,
    peer_id: uuidSchema,
    peer_username: usernameSchema.nullable(),
    peer_display_name: nullableTrimmedString(60, 'Display name'),
    peer_avatar_path: avatarPathSchema,
  })
  .strict();
export const conversationSearchResultsSchema = z.array(conversationSearchResultSchema);

export const messageSearchResultSchema = z
  .object({
    conversation_id: uuidSchema,
    message_id: uuidSchema,
    sequence: positiveSequenceSchema,
    snippet: z.string().min(1).max(240),
    sender_id: uuidSchema,
    created_at: timestampSchema,
    peer_id: uuidSchema,
    peer_username: usernameSchema.nullable(),
    peer_display_name: nullableTrimmedString(60, 'Display name'),
    peer_avatar_path: avatarPathSchema,
  })
  .strict();
export const messageSearchResultsSchema = z.array(messageSearchResultSchema);

export const messageSearchInputSchema = z
  .object({
    query: z.string().trim().min(2).max(200),
    before_created_at: timestampSchema.nullable().default(null),
    before_id: uuidSchema.nullable().default(null),
    result_limit: z.number().int().min(1).max(50).default(30),
  })
  .strict()
  .refine(
    (value) => (value.before_created_at === null) === (value.before_id === null),
    'Message search cursor fields must be provided together.',
  );

// ---- AI contacts (Task 009) ----
export const aiAgentSchema = z
  .object({
    id: uuidSchema,
    slug: z.string().min(1).max(50),
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(400),
    avatar_key: z.string().max(512).nullable().optional().default(null),
    enabled: z.boolean(),
  })
  .strict();
export const aiAgentListSchema = z.array(aiAgentSchema);

export const aiContactKindSchema = z.enum(['builtin', 'custom']);
export const aiMemoryModeSchema = z.enum(['conversation_only', 'curated']);
export const aiMemoryCategorySchema = z.enum([
  'personal_fact',
  'preference',
  'goal',
  'project',
  'constraint',
  'instruction',
  'interest',
  'other',
]);

export const aiConversationSchema = z
  .object({
    id: uuidSchema,
    kind: aiContactKindSchema,
    agent_id: uuidSchema.nullable(),
    persona_id: uuidSchema.nullable(),
    display_name: z.string().min(1).max(80),
    description: z.string().max(400).nullable(),
    avatar_key: z.string().max(512).nullable().optional().default(null),
    archived: z.boolean(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    last_message_at: timestampSchema.nullable(),
  })
  .strict();
export const aiConversationListSchema = z.array(aiConversationSchema);

export const deletedAiConversationSchema = uuidSchema;

export const aiPersonaToneSchema = z.enum(['warm', 'balanced', 'direct', 'playful', 'formal']);
export const aiPersonaVerbositySchema = z.enum(['concise', 'balanced', 'detailed']);

export const aiPersonaSchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(2).max(50),
    description: z.string().max(160),
    instructions: z.string().min(1).max(4000),
    tone: aiPersonaToneSchema,
    verbosity: aiPersonaVerbositySchema,
    avatar_path: avatarPathSchema.optional().default(null),
    archived: z.boolean(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict();
export const aiPersonaListSchema = z.array(aiPersonaSchema);

export const aiPersonaInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be 2–50 characters.')
      .max(50, 'Name must be 2–50 characters.'),
    description: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().max(160, 'Description must be at most 160 characters.'),
    ),
    instructions: z
      .string()
      .trim()
      .min(1, 'Instructions are required.')
      .max(4000, 'Instructions must be at most 4000 characters.'),
    tone: aiPersonaToneSchema,
    verbosity: aiPersonaVerbositySchema,
    avatar_path: avatarPathSchema.optional().default(null),
  })
  .strict();

export const aiMessageRoleSchema = z.enum(['user', 'assistant']);
export const MAX_AI_IMAGES_PER_MESSAGE = 2;
export const MAX_AI_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_AI_IMAGE_COMBINED_BYTES = 8 * 1024 * 1024;
export const aiImageMimeTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export const aiImageAttachmentSchema = z
  .object({
    id: uuidSchema,
    storage_bucket: z.literal('ai-chat-images'),
    storage_path: attachmentStoragePathSchema,
    original_filename: z.string().min(1).max(255),
    mime_type: aiImageMimeTypeSchema,
    size_bytes: z.number().int().positive().max(MAX_AI_IMAGE_BYTES),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    created_at: timestampSchema,
  })
  .strict();
export const aiImageUploadInputSchema = z
  .object({
    conversation_id: uuidSchema,
    original_filename: z.string().trim().min(1).max(255),
    mime_type: aiImageMimeTypeSchema,
    size_bytes: z.number().int().positive().max(MAX_AI_IMAGE_BYTES),
  })
  .strict();
export const aiImageUploadTargetSchema = z
  .object({
    attachment_id: uuidSchema,
    storage_bucket: z.literal('ai-chat-images'),
    storage_path: attachmentStoragePathSchema,
  })
  .strict();
export const finalizedAiImageSchema = z
  .object({
    attachment_id: uuidSchema,
    status: z.literal('ready'),
    mime_type: aiImageMimeTypeSchema,
    size_bytes: z.number().int().positive().max(MAX_AI_IMAGE_BYTES),
    original_filename: z.string().min(1).max(255),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export const MAX_AI_DOCUMENTS_PER_MESSAGE = 2;
export const MAX_AI_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_AI_TEXT_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const MAX_AI_DOCUMENT_COMBINED_BYTES = 15 * 1024 * 1024;
export const aiDocumentMimeTypeSchema = z.enum(['application/pdf', 'text/plain', 'text/markdown']);
export const aiDocumentAttachmentSchema = z
  .object({
    id: uuidSchema,
    original_filename: z.string().min(1).max(255),
    mime_type: aiDocumentMimeTypeSchema,
    size_bytes: z.number().int().positive().max(MAX_AI_PDF_BYTES),
    page_count: z.number().int().min(1).max(100).nullable(),
    status: z.enum(['attached', 'failed']),
    created_at: timestampSchema,
  })
  .strict();
export const aiDocumentUploadInputSchema = z
  .object({
    conversation_id: uuidSchema,
    original_filename: z.string().trim().min(1).max(255),
    mime_type: aiDocumentMimeTypeSchema,
    size_bytes: z.number().int().positive().max(MAX_AI_PDF_BYTES),
  })
  .strict();
export const aiDocumentUploadTargetSchema = z
  .object({
    attachment_id: uuidSchema,
    storage_bucket: z.literal('ai-chat-documents'),
    storage_path: attachmentStoragePathSchema,
  })
  .strict();
export const finalizedAiDocumentSchema = z
  .object({
    attachment_id: uuidSchema,
    status: z.literal('ready'),
    mime_type: aiDocumentMimeTypeSchema,
    size_bytes: z.number().int().positive().max(MAX_AI_PDF_BYTES),
    original_filename: z.string().min(1).max(255),
  })
  .strict();
export const aiDocumentAccessTargetSchema = z
  .object({
    storage_bucket: z.literal('ai-chat-documents'),
    storage_path: attachmentStoragePathSchema,
  })
  .strict();
export const MAX_FORWARDED_MESSAGES = 20;
export const MAX_FORWARDED_TEXT_LENGTH = 20_000;
export const MAX_FORWARD_INSTRUCTION_LENGTH = 2_000;
export const aiContextImportItemSchema = z
  .object({
    id: uuidSchema,
    source_sender_label: z.string().min(1).max(80),
    copied_content: z.string().min(1).max(8000),
    source_created_at: timestampSchema,
    position: z.number().int().min(1).max(MAX_FORWARDED_MESSAGES),
    attachments_excluded: z.boolean(),
  })
  .strict();
export const aiContextImportSchema = z
  .object({
    id: uuidSchema,
    message_count: z.number().int().min(1).max(MAX_FORWARDED_MESSAGES),
    copied_character_count: z.number().int().min(1).max(MAX_FORWARDED_TEXT_LENGTH),
    instruction: z.string().min(1).max(MAX_FORWARD_INSTRUCTION_LENGTH).nullable(),
    created_at: timestampSchema,
    items: z.array(aiContextImportItemSchema).min(1).max(MAX_FORWARDED_MESSAGES),
  })
  .strict();
export const aiContextForwardInputSchema = z
  .object({
    source_conversation_id: uuidSchema,
    source_message_ids: z.array(uuidSchema).min(1).max(MAX_FORWARDED_MESSAGES),
  })
  .strict();
export const aiMessageSchema = z
  .object({
    id: uuidSchema,
    conversation_id: uuidSchema,
    role: aiMessageRoleSchema,
    content: z.string().min(1).max(40000),
    client_message_id: uuidSchema,
    created_at: timestampSchema,
    attachments: z.array(aiImageAttachmentSchema).max(MAX_AI_IMAGES_PER_MESSAGE).default([]),
    documents: z.array(aiDocumentAttachmentSchema).max(MAX_AI_DOCUMENTS_PER_MESSAGE).default([]),
    context_import: aiContextImportSchema.nullable().default(null),
  })
  .strict();
export const aiMessageListSchema = z.array(aiMessageSchema);

export const aiArtifactTypeSchema = z.enum([
  'document',
  'plan',
  'checklist',
  'research_brief',
  'comparison',
  'study_plan',
  'decision_record',
  'project_outline',
]);
export const aiArtifactVersionSchema = z
  .object({
    id: uuidSchema,
    version_number: z.number().int().positive(),
    content: z.string().min(1).max(100000),
    source_ai_message_id: uuidSchema.nullable(),
    created_by: z.enum(['user', 'ai']),
    created_at: timestampSchema,
  })
  .strict();
export const aiArtifactSchema = z
  .object({
    id: uuidSchema,
    ai_conversation_id: uuidSchema,
    agent_id: uuidSchema.nullable(),
    persona_id: uuidSchema.nullable(),
    type: aiArtifactTypeSchema,
    title: z.string().min(1).max(120),
    current_version_number: z.number().int().positive(),
    current_content: z.string().min(1).max(100000),
    ai_contact_name: z.string().min(1).max(80),
    ai_revision_available: z.boolean(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    archived_at: timestampSchema.nullable(),
    versions: z.array(aiArtifactVersionSchema),
  })
  .strict();
export const aiArtifactListSchema = z.array(aiArtifactSchema);
export const aiArtifactCreateInputSchema = z
  .object({
    source_ai_message_id: uuidSchema,
    type: aiArtifactTypeSchema,
    title: z.string().trim().min(1).max(120),
    content: z.string().min(1).max(100000),
    client_request_id: uuidSchema,
  })
  .strict();
export const aiArtifactVersionInputSchema = z
  .object({
    artifact_id: uuidSchema,
    content: z.string().min(1).max(100000),
    created_by: z.enum(['user', 'ai']),
    client_request_id: uuidSchema,
    expected_current_version: z.number().int().positive().nullable().default(null),
  })
  .strict();

export const aiMemorySchema = z
  .object({
    id: uuidSchema,
    conversation_id: uuidSchema,
    category: aiMemoryCategorySchema,
    content: z.string().min(1).max(500),
    source_message_id: uuidSchema.nullable(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict();
export const aiMemoryListSchema = z.array(aiMemorySchema);

export const aiMemoryInputSchema = z
  .object({
    category: aiMemoryCategorySchema,
    content: z.string().trim().min(1, 'Memory text is required.').max(500),
    source_message_id: uuidSchema.nullable().default(null),
  })
  .strict();

export const aiMemorySettingsSchema = z
  .object({
    conversation_id: uuidSchema,
    memory_mode: aiMemoryModeSchema,
  })
  .strict();
export const aiDeletedMemoryCountSchema = z.number().int().nonnegative();

export const aiProviderMetadataSchema = z.union([
  z.object({ status: z.literal('ok') }).strict(),
  z
    .object({
      status: z.enum(['ok', 'configuration_error']),
      provider_mode: z.enum(['openrouter', 'mock']),
      model: z.string().min(1).max(200),
      vision_model: z.string().min(1).max(200),
      pdf_engine: z.string().min(1).max(100),
    })
    .strict(),
]);

export const aiAccessStateSchema = z.enum([
  'trial_available',
  'trial_active',
  'trial_expired',
  'credits_exhausted',
  'pro',
]);
export const aiAccessSchema = z
  .object({
    is_pro: z.boolean(),
    pro_expires_at: timestampSchema.nullable(),
    pro_credits_remaining: z.number().int().nonnegative(),
    trial_started_at: timestampSchema.nullable(),
    trial_expires_at: timestampSchema.nullable(),
    trial_credits_remaining: z.number().int().nonnegative(),
    active_credit_source: z.enum(['premium', 'trial']).nullable(),
    access_state: aiAccessStateSchema,
    can_generate: z.boolean(),
  })
  .strict();

export const premiumCodeInputSchema = z
  .object({
    code: z.string().trim().min(16).max(128),
  })
  .strict();

export const premiumRedemptionSchema = z
  .object({
    redeemed: z.boolean(),
    pro_expires_at: timestampSchema.nullable(),
    pro_credits_remaining: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const premiumGrantSchema = z
  .object({
    id: uuidSchema,
    starts_at: timestampSchema,
    ends_at: timestampSchema,
    credits_granted: z.number().int().min(1).max(1000),
    created_at: timestampSchema,
  })
  .strict();
export const premiumGrantListSchema = z.array(premiumGrantSchema);

export const aiSendInputSchema = z
  .object({
    conversation_id: uuidSchema,
    client_message_id: uuidSchema,
    content: z.string().trim().max(8000),
    attachment_ids: z.array(uuidSchema).max(MAX_AI_IMAGES_PER_MESSAGE).default([]),
    document_attachment_ids: z.array(uuidSchema).max(MAX_AI_DOCUMENTS_PER_MESSAGE).default([]),
    context_import: aiContextForwardInputSchema.nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.context_import) {
      if (value.content.length > MAX_FORWARD_INSTRUCTION_LENGTH) {
        context.addIssue({
          code: 'too_big',
          maximum: MAX_FORWARD_INSTRUCTION_LENGTH,
          origin: 'string',
          path: ['content'],
          message: `Instruction must be at most ${MAX_FORWARD_INSTRUCTION_LENGTH} characters.`,
        });
      }
      if (value.attachment_ids.length > 0) {
        context.addIssue({
          code: 'custom',
          path: ['attachment_ids'],
          message: 'Forwarded context cannot include attachments.',
        });
      }
      if (value.document_attachment_ids.length > 0) {
        context.addIssue({
          code: 'custom',
          path: ['document_attachment_ids'],
          message: 'Forwarded context cannot include document attachments.',
        });
      }
    } else if (value.content.length < 1) {
      context.addIssue({
        code: 'custom',
        path: ['content'],
        message: 'Message content is required.',
      });
    }
  });

// Events of the small SSE protocol, validated in the browser before any use.
export const aiStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), run_id: uuidSchema }).strict(),
  z.object({ type: z.literal('delta'), text: z.string() }).strict(),
  z
    .object({
      type: z.literal('done'),
      message: z
        .object({
          id: uuidSchema,
          role: z.literal('assistant'),
          content: z.string().min(1).max(40000),
          created_at: timestampSchema,
        })
        .strict(),
      credits_remaining: z.number().int().nonnegative().nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('error'),
      category: z.string().min(1).max(64),
      credits_remaining: z.number().int().nonnegative().nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('proposal_done'),
      content: z.string().min(1).max(100000),
      credits_remaining: z.number().int().nonnegative().nullable().optional(),
    })
    .strict(),
]);

export const aiErrorCategorySchema = z.enum([
  'authentication_required',
  'invalid_request',
  'ai_conversation_not_found',
  'ai_agent_unavailable',
  'ai_run_in_progress',
  'trial_expired',
  'credits_exhausted',
  'rate_limited',
  'provider_unavailable',
  'provider_error',
  'provider_not_configured',
  'cancelled',
  'persona_not_found',
  'persona_limit_reached',
  'invalid_persona',
  'memory_not_found',
  'memory_limit_reached',
  'invalid_memory',
  'invalid_memory_source',
  'invalid_memory_mode',
  'invalid_image',
  'image_too_large',
  'unsupported_image',
  'image_unavailable',
  'vision_provider_unavailable',
  'idempotency_conflict',
  'invalid_context_import',
  'context_import_too_large',
  'context_import_unavailable',
  'source_conversation_unavailable',
  'source_message_unavailable',
  'unsupported_document',
  'document_too_large',
  'document_unavailable',
  'document_unreadable',
  'document_text_too_long',
  'pdf_parser_unavailable',
  'session_expired',
  'backend_unavailable',
  'unknown_error',
]);

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .max(254, 'Email is too long.')
  .email('Enter a valid email address.');

export const passwordSchema = z
  .string()
  .min(10, 'Password must contain at least 10 characters.')
  .max(128, 'Password must contain at most 128 characters.');

const confirmationRefinement = (value) => value.password === value.confirmPassword;

export const registrationFormSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      error: 'You must acknowledge the terms and privacy policy.',
    }),
  })
  .strict()
  .refine(confirmationRefinement, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export const loginFormSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required.').max(128, 'Password is too long.'),
  })
  .strict();

export const forgotPasswordFormSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetPasswordFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .strict()
  .refine(confirmationRefinement, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export const usernameOnboardingSchema = z
  .object({
    username: usernameSchema,
    display_name: nullableTrimmedString(60, 'Display name'),
  })
  .strict();

export const profileFormSchema = z
  .object({
    username: usernameSchema,
    display_name: nullableTrimmedString(60, 'Display name'),
    bio: nullableTrimmedString(300, 'Biography'),
    status_text: nullableTrimmedString(120, 'Status text'),
  })
  .strict();

export const notificationPreferencesSchema = z
  .object({
    message_notifications: z.boolean(),
    message_previews: z.boolean(),
    sound: z.boolean(),
  })
  .strict();

export const privacyPreferencesSchema = z
  .object({
    show_online_status: z.boolean(),
    show_last_seen: z.boolean(),
    allow_contact_requests: z.boolean(),
  })
  .strict();

export const preferencesFormSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']),
    notification_preferences: notificationPreferencesSchema,
    privacy_preferences: privacyPreferencesSchema,
  })
  .strict();

/** @typedef {z.infer<typeof contactRelationshipSchema>} ContactRelationship */
/** @typedef {z.infer<typeof contactListItemSchema>} ContactListItem */
/** @typedef {z.infer<typeof contactRequestItemSchema>} ContactRequestItem */
/** @typedef {z.infer<typeof profileSearchResultSchema>} ProfileSearchResult */
/** @typedef {z.infer<typeof blockedUserItemSchema>} BlockedUserItem */
/** @typedef {z.infer<typeof contactActionResultSchema>} ContactActionResult */
/** @typedef {z.infer<typeof profileUpdateInputSchema>} ProfileUpdateInput */
/** @typedef {z.infer<typeof publicProfileSchema>} PublicProfile */
/** @typedef {z.infer<typeof userSettingsUpdateSchema>} UserSettingsUpdate */
/** @typedef {z.infer<typeof profileSearchQuerySchema>} ProfileSearchQuery */
/** @typedef {z.infer<typeof registrationFormSchema>} RegistrationForm */
/** @typedef {z.infer<typeof loginFormSchema>} LoginForm */
/** @typedef {z.infer<typeof usernameOnboardingSchema>} UsernameOnboarding */
/** @typedef {z.infer<typeof profileFormSchema>} ProfileForm */
/** @typedef {z.infer<typeof preferencesFormSchema>} PreferencesForm */
/** @typedef {z.infer<typeof directConversationResultSchema>} DirectConversationResult */
/** @typedef {z.infer<typeof conversationListItemSchema>} ConversationListItem */
/** @typedef {z.infer<typeof messageSchema>} Message */
/** @typedef {z.infer<typeof attachmentSchema>} Attachment */
/** @typedef {z.infer<typeof attachmentUploadTargetSchema>} AttachmentUploadTarget */
/** @typedef {z.infer<typeof finalizedAttachmentSchema>} FinalizedAttachment */
/** @typedef {z.infer<typeof reactionSchema>} Reaction */
/** @typedef {z.infer<typeof conversationMemberReceiptSchema>} ConversationMemberReceipt */
/** @typedef {z.infer<typeof sendMessageInputSchema>} SendMessageInput */
/** @typedef {z.infer<typeof messagingErrorCategorySchema>} MessagingErrorCategory */
/** @typedef {z.infer<typeof realtimeEventEnvelopeSchema>} RealtimeEventEnvelope */
/** @typedef {z.infer<typeof realtimeSubscriptionStatusSchema>} RealtimeSubscriptionStatus */
