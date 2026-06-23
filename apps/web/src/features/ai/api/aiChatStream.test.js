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

  it('rejects malformed JSON and events that fail the contract', () => {
    const parser = createAiStreamParser();
    expect(() => parser.push('data: not-json\n\n')).toThrow('invalid_stream');
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

  it('parses a final terminal event without a trailing newline', () => {
    const parser = createAiStreamParser();
    const terminal = JSON.stringify({
      type: 'error',
      category: 'provider_unavailable',
      credits_remaining: 19,
    });
    expect(parser.finish(`data: ${terminal}`)).toEqual([
      { type: 'error', category: 'provider_unavailable', credits_remaining: 19 },
    ]);
  });

  it('rejects partial JSON at EOF', () => {
    const parser = createAiStreamParser();
    parser.push('data: {"type":"done"');
    expect(() => parser.finish()).toThrow('invalid_stream');
  });

  it('rejects EOF without a terminal event', () => {
    const parser = createAiStreamParser();
    parser.push(`data: ${JSON.stringify({ type: 'delta', text: 'partial' })}\n\n`);
    expect(() => parser.finish()).toThrow('invalid_stream');
  });

  it('rejects a second terminal event', () => {
    const parser = createAiStreamParser();
    const error = JSON.stringify({ type: 'error', category: 'provider_unavailable' });
    parser.push(`data: ${error}\n\n`);
    expect(() => parser.finish(`data: ${error}`)).toThrow('invalid_stream');
  });

  it('accepts an artifact proposal as the single terminal event', () => {
    const parser = createAiStreamParser();
    expect(
      parser.finish(
        `data: ${JSON.stringify({
          type: 'proposal_done',
          content: 'Revised artifact',
          credits_remaining: 17,
        })}`,
      ),
    ).toEqual([
      {
        type: 'proposal_done',
        content: 'Revised artifact',
        credits_remaining: 17,
      },
    ]);
  });

  it('preserves fragmented multibyte UTF-8 through decoder flushing', () => {
    const decoder = new TextDecoder();
    const bytes = new TextEncoder().encode(
      `data: ${JSON.stringify({ type: 'delta', text: 'İstanbul' })}\n\n`,
    );
    const parser = createAiStreamParser();
    const split = bytes.length - 3;
    const events = [
      ...parser.push(decoder.decode(bytes.slice(0, split), { stream: true })),
      ...parser.push(decoder.decode(bytes.slice(split), { stream: true })),
    ];
    parser.push(`data: ${JSON.stringify({ type: 'error', category: 'provider_unavailable' })}\n\n`);
    parser.finish(decoder.decode());
    expect(events[0].text).toBe('İstanbul');
  });
});
