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

/** @typedef {z.infer<typeof profileUpdateInputSchema>} ProfileUpdateInput */
/** @typedef {z.infer<typeof publicProfileSchema>} PublicProfile */
/** @typedef {z.infer<typeof userSettingsUpdateSchema>} UserSettingsUpdate */
/** @typedef {z.infer<typeof profileSearchQuerySchema>} ProfileSearchQuery */
