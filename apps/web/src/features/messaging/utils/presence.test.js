import { describe, expect, it } from 'vitest';
import { presenceLabel } from './presence.js';

describe('presenceLabel', () => {
  it('renders online, last seen, and privacy-hidden states', () => {
    expect(presenceLabel({ is_online: true, last_seen_at: null })).toBe('Online');
    expect(
      presenceLabel(
        { is_online: false, last_seen_at: '2026-06-23T09:55:00.000Z' },
        new Date('2026-06-23T10:00:00.000Z').getTime(),
      ),
    ).toBe('Last seen 5 minutes ago');
    expect(presenceLabel({ is_online: null, last_seen_at: null })).toBe('');
  });
});
