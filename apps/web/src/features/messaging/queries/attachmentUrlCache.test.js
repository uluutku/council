import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAttachmentUrlCache,
  evictAttachmentUrls,
  getCachedAttachmentUrl,
  setCachedAttachmentUrl,
} from './attachmentUrlCache.js';

describe('attachment URL cache', () => {
  beforeEach(() => {
    clearAttachmentUrlCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearAttachmentUrlCache();
  });

  it('returns a cached URL before it expires', () => {
    setCachedAttachmentUrl('a1', 'https://signed/a1', 600);
    expect(getCachedAttachmentUrl('a1')).toBe('https://signed/a1');
  });

  it('expires entries before the server URL lapses', () => {
    setCachedAttachmentUrl('a1', 'https://signed/a1', 600);
    // The cache expires ~60s early; advancing past that drops the entry.
    vi.advanceTimersByTime(541 * 1000);
    expect(getCachedAttachmentUrl('a1')).toBeNull();
  });

  it('evicts specific attachments (used on message deletion)', () => {
    setCachedAttachmentUrl('a1', 'https://signed/a1', 600);
    setCachedAttachmentUrl('a2', 'https://signed/a2', 600);
    evictAttachmentUrls(['a1']);
    expect(getCachedAttachmentUrl('a1')).toBeNull();
    expect(getCachedAttachmentUrl('a2')).toBe('https://signed/a2');
  });

  it('clears everything on sign-out', () => {
    setCachedAttachmentUrl('a1', 'https://signed/a1', 600);
    clearAttachmentUrlCache();
    expect(getCachedAttachmentUrl('a1')).toBeNull();
  });
});
