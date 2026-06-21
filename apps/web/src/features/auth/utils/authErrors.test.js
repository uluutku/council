import { describe, expect, it } from 'vitest';
import { mapSupabaseError } from './authErrors.js';

describe('mapSupabaseError', () => {
  it('maps provider errors to safe user-facing categories', () => {
    expect(mapSupabaseError({ code: 'invalid_credentials' })).toEqual({
      category: 'invalid_credentials',
      message: 'Email or password is incorrect.',
    });
    expect(mapSupabaseError({ code: '23505', message: 'private sql detail' }).category).toBe(
      'username_unavailable',
    );
    expect(mapSupabaseError({ code: 'user_already_exists' }).message).not.toContain(
      'already exists',
    );
  });

  it('never returns an unfiltered backend message', () => {
    const result = mapSupabaseError({ message: 'secret internal provider detail' });
    expect(result.message).not.toContain('secret internal provider detail');
  });
});
