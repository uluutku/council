import { describe, expect, it } from 'vitest';
import { createCustomPersona, deleteAiConversation, updateCustomPersona } from './aiApi.js';

const CONVERSATION_ID = 'c0000000-0000-4000-8000-000000000002';
const PERSONA_ID = '50000000-0000-4000-8000-000000000005';
const PERSONA_ROW = {
  id: PERSONA_ID,
  name: 'My Coach',
  description: '',
  instructions: 'Help me plan.',
  tone: 'balanced',
  verbosity: 'concise',
  archived: false,
  created_at: '2026-06-22T10:00:00+00:00',
  updated_at: '2026-06-22T10:00:00+00:00',
};

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

function makeSingleClient(responses) {
  const calls = [];
  const queue = [...responses];
  return {
    calls,
    rpc(name, args) {
      calls.push({ name, args });
      return {
        single: () => Promise.resolve(queue.shift()),
      };
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

  it('opens legacy custom-persona creation RPCs when no avatar path is selected', async () => {
    const client = makeSingleClient([
      { data: null, error: { code: 'PGRST202', message: 'could not find the function' } },
      { data: PERSONA_ROW, error: null },
    ]);

    await expect(
      createCustomPersona(
        {
          name: 'My Coach',
          description: '',
          instructions: 'Help me plan.',
          tone: 'balanced',
          verbosity: 'concise',
          avatar_path: null,
        },
        client,
      ),
    ).resolves.toMatchObject({ id: PERSONA_ID, avatar_path: null });

    expect(client.calls).toHaveLength(2);
    expect(client.calls[0].args).toHaveProperty('p_avatar_path', null);
    expect(client.calls[1].args).not.toHaveProperty('p_avatar_path');
  });

  it('opens legacy custom-persona update RPCs when no avatar path is selected', async () => {
    const client = makeSingleClient([
      { data: null, error: { code: '42883', message: 'function does not exist' } },
      { data: PERSONA_ROW, error: null },
    ]);

    await expect(
      updateCustomPersona(
        PERSONA_ID,
        {
          name: 'My Coach',
          description: '',
          instructions: 'Help me plan.',
          tone: 'balanced',
          verbosity: 'concise',
          avatar_path: null,
        },
        client,
      ),
    ).resolves.toMatchObject({ id: PERSONA_ID, avatar_path: null });

    expect(client.calls).toHaveLength(2);
    expect(client.calls[1].args).toEqual({
      p_persona_id: PERSONA_ID,
      p_name: 'My Coach',
      p_description: '',
      p_instructions: 'Help me plan.',
      p_tone: 'balanced',
      p_verbosity: 'concise',
    });
  });
});
