import assert from 'node:assert/strict';
import { createDeadlineSignal, parseTimeout } from './request-control.mjs';

assert.equal(parseTimeout('250', 1000), 250);
assert.equal(parseTimeout('unsafe', 1000), 1000);

const deadline = createDeadlineSignal(new AbortController().signal, 50);
await new Promise((resolve) => deadline.signal.addEventListener('abort', resolve, { once: true }));
assert.equal(deadline.timedOut(), true);
deadline.cleanup();

const client = new AbortController();
const combined = createDeadlineSignal(client.signal, 1000);
client.abort();
assert.equal(combined.signal.aborted, true);
assert.equal(combined.timedOut(), false);
combined.cleanup();
