import { describe, expect, it } from 'vitest';
import {
  applicationConfigSchema,
  blockedUserItemSchema,
  contactActionResultSchema,
  contactListItemSchema,
  contactRequestDirectionSchema,
  contactRequestItemSchema,
  contactRequestResponseSchema,
  contactSearchFormSchema,
  emailSchema,
  forgotPasswordFormSchema,
  loginFormSchema,
  notificationPreferencesSchema,
  passwordSchema,
  preferencesFormSchema,
  privacyPreferencesSchema,
  profileFormSchema,
  profileSearchQuerySchema,
  profileSearchResultSchema,
  profileUpdateInputSchema,
  publicProfileSchema,
  registrationFormSchema,
  relationshipStatusSchema,
  resetPasswordFormSchema,
  userSettingsUpdateSchema,
  usernameOnboardingSchema,
  usernameSchema,
} from './index.js';

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
