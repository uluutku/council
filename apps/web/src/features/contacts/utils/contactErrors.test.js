import { describe, expect, it } from 'vitest';
import { mapContactError } from './contactErrors.js';

describe('mapContactError', () => {
  it('maps a too-short search to query_too_short', () => {
    expect(
      mapContactError({
        code: '22023',
        message: 'profile search query must contain at least 2 characters',
      }).category,
    ).toBe('query_too_short');
  });

  it('maps other invalid-parameter errors to validation_error', () => {
    expect(
      mapContactError({ code: '22023', message: 'response must be accepted or rejected' }).category,
    ).toBe('validation_error');
  });

  it('maps a stale pending response to request_no_longer_pending', () => {
    expect(
      mapContactError({
        code: '22023',
        message: 'only pending contact requests can be answered',
      }).category,
    ).toBe('request_no_longer_pending');
  });

  it('maps a missing contact request to request_no_longer_pending', () => {
    expect(mapContactError({ code: 'P0002', message: 'contact request not found' }).category).toBe(
      'request_no_longer_pending',
    );
  });

  it('maps a missing target user to a generic user_unavailable', () => {
    expect(mapContactError({ code: 'P0002', message: 'target user not found' }).category).toBe(
      'user_unavailable',
    );
  });

  it('collapses a block rejection into a generic unavailable message', () => {
    const result = mapContactError({ code: '42501', message: 'contact request is not allowed' });
    expect(result.category).toBe('blocked_unavailable');
    expect(result.message).toBe('This person is not available right now.');
  });

  it('collapses a privacy rejection into the same generic message', () => {
    const blocked = mapContactError({ code: '42501', message: 'contact request is not allowed' });
    const privacy = mapContactError({
      code: '42501',
      message: 'target user does not allow contact requests',
    });
    expect(privacy.message).toBe(blocked.message);
  });

  it('maps a non-participant 42501 to action_not_permitted', () => {
    expect(
      mapContactError({ code: '42501', message: 'only a request participant may respond' })
        .category,
    ).toBe('action_not_permitted');
  });

  it('maps authentication-required to session_expired', () => {
    expect(mapContactError({ code: '42501', message: 'authentication required' }).category).toBe(
      'session_expired',
    );
  });

  it('maps a fetch TypeError to network_unavailable', () => {
    expect(mapContactError(new TypeError('Failed to fetch')).category).toBe('network_unavailable');
  });

  it('maps a 429 to rate_limited', () => {
    expect(mapContactError({ status: 429, message: 'rate limit exceeded' }).category).toBe(
      'rate_limited',
    );
  });

  it('maps server and PostgREST failures to backend_unavailable', () => {
    expect(mapContactError({ status: 503, message: 'service unavailable' }).category).toBe(
      'backend_unavailable',
    );
    expect(mapContactError({ code: 'PGRST116', message: 'no rows' }).category).toBe(
      'backend_unavailable',
    );
  });

  it('falls back to unknown for unrecognized errors', () => {
    expect(mapContactError({ message: 'mystery' }).category).toBe('unknown');
  });

  it('never echoes the raw database message', () => {
    const raw = 'duplicate key value violates unique constraint "contact_relationships_pair_key"';
    expect(mapContactError({ code: '23505', message: raw }).message).not.toContain('constraint');
  });
});
