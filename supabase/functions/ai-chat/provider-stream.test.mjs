import assert from 'node:assert/strict';
import { createOpenRouterStreamParser } from './provider-stream.mjs';

const valid = createOpenRouterStreamParser();
assert.deepEqual(valid.push('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'), {
  deltas: ['Hi'],
  usage: null,
});
assert.deepEqual(valid.finish('data: [DONE]'), { deltas: [], usage: null });

const missing = createOpenRouterStreamParser();
missing.push('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
assert.throws(() => missing.finish(), /invalid_provider_stream/);

const truncated = createOpenRouterStreamParser();
assert.throws(() => truncated.finish('data: {"choices":'), /invalid_provider_stream/);

const duplicate = createOpenRouterStreamParser();
duplicate.push('data: [DONE]\n\n');
assert.throws(() => duplicate.finish('data: [DONE]'), /invalid_provider_stream/);

const utf8 = createOpenRouterStreamParser();
assert.deepEqual(utf8.push('data: {"choices":[{"delta":{"content":"İstanbul"}}]}\n\n').deltas, [
  'İstanbul',
]);
utf8.finish('data: [DONE]');
