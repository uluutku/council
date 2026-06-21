import { describe, expect, it } from 'vitest';
import {
  contactRequestResponseSchema,
  profileSearchQuerySchema,
  profileUpdateInputSchema,
} from '@council/schemas';

describe('shared social contracts', () => {
  it('are importable by the web workspace without duplicating schemas', () => {
    expect(contactRequestResponseSchema.parse('accepted')).toBe('accepted');
    expect(profileSearchQuerySchema.parse({ query: 'utku' }).result_limit).toBe(20);
    expect(
      profileUpdateInputSchema.parse({
        username: 'Utku',
        display_name: null,
        bio: null,
        avatar_path: null,
        status_text: null,
      }).username,
    ).toBe('utku');
  });
});
