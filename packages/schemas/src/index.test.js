import { describe, expect, it } from 'vitest';
import {
  applicationConfigSchema,
  contactRequestDirectionSchema,
  contactRequestResponseSchema,
  profileSearchQuerySchema,
  profileUpdateInputSchema,
  publicProfileSchema,
  relationshipStatusSchema,
  userSettingsUpdateSchema,
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
