import { describe, expect, it } from 'vitest';
import { createAiStreamParser } from './aiChatStream.js';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';

describe('createAiStreamParser', () => {
  it('parses complete data lines into validated events', () => {
    const parser = createAiStreamParser();
    const events = parser.push(
      `data: ${JSON.stringify({ type: 'start', run_id: RUN_ID })}\n\n` +
        `data: ${JSON.stringify({ type: 'delta', text: 'Hi' })}\n\n`,
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'start', run_id: RUN_ID });
    expect(events[1]).toEqual({ type: 'delta', text: 'Hi' });
  });

  it('buffers a partial line until the rest arrives', () => {
    const parser = createAiStreamParser();
    expect(parser.push('data: {"type":"delta",')).toHaveLength(0);
    const events = parser.push('"text":"world"}\n\n');
    expect(events).toEqual([{ type: 'delta', text: 'world' }]);
  });

  it('drops malformed JSON and events that fail the contract', () => {
    const parser = createAiStreamParser();
    const events = parser.push(
      'data: not-json\n\n' +
        `data: ${JSON.stringify({ type: 'delta' })}\n\n` + // missing text
        `data: ${JSON.stringify({ type: 'bogus', foo: 1 })}\n\n`,
    );
    expect(events).toHaveLength(0);
  });

  it('validates the done event shape', () => {
    const parser = createAiStreamParser();
    const events = parser.push(
      `data: ${JSON.stringify({
        type: 'done',
        message: {
          id: MESSAGE_ID,
          role: 'assistant',
          content: 'Answer',
          created_at: '2026-06-22T10:00:00+00:00',
        },
        credits_remaining: 18,
      })}\n\n`,
    );
    expect(events[0].type).toBe('done');
    expect(events[0].credits_remaining).toBe(18);
  });
});
