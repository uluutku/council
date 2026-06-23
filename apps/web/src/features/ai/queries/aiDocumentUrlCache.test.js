import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAiDocumentUrlCache,
  getCachedAiDocumentUrl,
  setCachedAiDocumentUrl,
} from './aiDocumentUrlCache.js';

describe('AI document URL cache', () => {
  beforeEach(clearAiDocumentUrlCache);

  it('separates identical document IDs by conversation and clears private URLs', () => {
    setCachedAiDocumentUrl('conversation-a', 'document-1', 'https://signed/a', 600);
    expect(getCachedAiDocumentUrl('conversation-a', 'document-1')).toBe('https://signed/a');
    expect(getCachedAiDocumentUrl('conversation-b', 'document-1')).toBeNull();
    clearAiDocumentUrlCache();
    expect(getCachedAiDocumentUrl('conversation-a', 'document-1')).toBeNull();
  });
});
