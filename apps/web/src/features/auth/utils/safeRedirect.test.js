import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_PATH, getSafeReturnPath } from './safeRedirect.js';

describe('getSafeReturnPath', () => {
  it('preserves approved internal application destinations', () => {
    expect(getSafeReturnPath('/app/profile?section=identity')).toBe(
      '/app/profile?section=identity',
    );
  });

  it.each([
    'https://malicious.example',
    '//malicious.example',
    'javascript:alert(1)',
    '/login',
    null,
  ])('normalizes unsafe destination %s', (destination) => {
    expect(getSafeReturnPath(destination)).toBe(DEFAULT_APP_PATH);
  });
});
