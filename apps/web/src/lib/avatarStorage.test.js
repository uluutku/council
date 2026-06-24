import { describe, expect, it } from 'vitest';
import { avatarUploadErrorMessage } from './avatarStorage.js';

describe('avatarUploadErrorMessage', () => {
  it('maps a missing Storage bucket to a setup-focused message', () => {
    expect(
      avatarUploadErrorMessage({
        statusCode: '404',
        error: 'Bucket not found',
        message: 'Bucket not found',
      }),
    ).toBe(
      'Avatar storage is not configured yet. Apply the latest database migrations and try again.',
    );
  });
});
