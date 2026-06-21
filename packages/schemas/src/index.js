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
