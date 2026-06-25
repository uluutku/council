import { beforeEach, describe, expect, it } from 'vitest';
import { clearAiDraft, loadAiDraft, saveAiDraft } from './aiDraftStorage.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  localStorage.clear();
});

describe('aiDraftStorage', () => {
  it('stores AI drafts per user and conversation', () => {
    expect(saveAiDraft(USER_ID, CONVERSATION_ID, 'ask about my project')).toBe(true);
    expect(loadAiDraft(USER_ID, CONVERSATION_ID)).toBe('ask about my project');
    expect(loadAiDraft(OTHER_USER_ID, CONVERSATION_ID)).toBe('');

    expect(clearAiDraft(USER_ID, CONVERSATION_ID)).toBe(true);
    expect(loadAiDraft(USER_ID, CONVERSATION_ID)).toBe('');
  });

  it('rejects invalid scope values and oversized drafts', () => {
    expect(saveAiDraft('not-a-user-id', CONVERSATION_ID, 'draft')).toBe(false);
    expect(saveAiDraft(USER_ID, CONVERSATION_ID, 'x'.repeat(8001))).toBe(false);
    expect(loadAiDraft(USER_ID, CONVERSATION_ID)).toBe('');
  });
});
