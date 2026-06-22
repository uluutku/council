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
  messageEditedEventSchema,
  messageDeletedEventSchema,
  reactionChangedEventSchema,
  receiptChangedEventSchema,
  conversationCreatedEventSchema,
  conversationChangedEventSchema,
  messagingAvailabilityChangedEventSchema,
]);

// ---- AI contacts (Task 009) ----
export const aiAgentSchema = z
  .object({
    id: uuidSchema,
    slug: z.string().min(1).max(50),
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(400),
    avatar_key: z.string().max(512).nullable(),
    enabled: z.boolean(),
  })
  .strict();
export const aiAgentListSchema = z.array(aiAgentSchema);

export const aiConversationSchema = z
  .object({
    id: uuidSchema,
    agent_id: uuidSchema,
    agent_slug: z.string().min(1).max(50),
    agent_name: z.string().min(1).max(80),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    last_message_at: timestampSchema.nullable(),
  })
  .strict();
export const aiConversationListSchema = z.array(aiConversationSchema);

export const aiMessageRoleSchema = z.enum(['user', 'assistant']);
export const aiMessageSchema = z
  .object({
    id: uuidSchema,
    conversation_id: uuidSchema,
    role: aiMessageRoleSchema,
    content: z.string().min(1).max(40000),
    client_message_id: uuidSchema,
    created_at: timestampSchema,
  })
  .strict();
export const aiMessageListSchema = z.array(aiMessageSchema);

export const aiAccessStateSchema = z.enum([
  'trial_available',
  'trial_active',
  'trial_expired',
  'credits_exhausted',
  'pro',
]);
export const aiAccessSchema = z
  .object({
    trial_started_at: timestampSchema.nullable(),
    trial_expires_at: timestampSchema.nullable(),
    trial_credits_remaining: z.number().int().nonnegative(),
    pro_enabled: z.boolean(),
    access_state: aiAccessStateSchema,
    can_generate: z.boolean(),
  })
  .strict();

export const aiSendInputSchema = z
  .object({
    conversation_id: uuidSchema,
    client_message_id: uuidSchema,
    content: z.string().trim().min(1).max(8000),
  })
  .strict();

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
