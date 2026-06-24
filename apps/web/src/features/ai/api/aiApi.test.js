import { describe, expect, it } from 'vitest';
import { deleteAiConversation } from './aiApi.js';

const CONVERSATION_ID = 'c0000000-0000-4000-8000-000000000002';

function makeClient(response) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve(response);
    },
  };
}

describe('AI API wrappers', () => {
  it('deletes an AI conversation through the owner-scoped RPC', async () => {
    const client = makeClient({ data: CONVERSATION_ID, error: null });
    const result = await deleteAiConversation(CONVERSATION_ID, client);

    expect(client.calls[0]).toEqual({
      name: 'delete_ai_conversation',
      args: { p_conversation_id: CONVERSATION_ID },
    });
    expect(result).toBe(CONVERSATION_ID);
  });

  it('rejects malformed delete responses', async () => {
    const client = makeClient({ data: 'not-a-uuid', error: null });
    await expect(deleteAiConversation(CONVERSATION_ID, client)).rejects.toBeTruthy();
  });
});
