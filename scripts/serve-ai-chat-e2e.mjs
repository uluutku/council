import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const appOrigin = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';
const healthPort = Number(process.env.AI_CHAT_E2E_HEALTH_PORT || 54329);
const healthUrl = 'http://127.0.0.1:54321/functions/v1/ai-chat';

let ready = false;
let lastError = 'ai-chat mock function is starting';

function localOrigin(value) {
  const url = new URL(value);
  const hosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (url.protocol !== 'http:' || !hosts.has(url.hostname) || !url.port) {
    throw new Error('PLAYWRIGHT_BASE_URL must be a local http origin with an explicit port.');
  }
  return url.origin;
}

async function waitForAiChat() {
  const origin = localOrigin(appOrigin);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, { headers: { Origin: origin } });
      const body = await response.json().catch(() => ({}));
      if (response.status === 200 && body?.status === 'ok') {
        ready = true;
        lastError = '';
        return;
      }
      lastError = `ai-chat health returned HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'ai-chat health check failed';
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`ai-chat mock function did not become ready: ${lastError}`);
}

const child = spawn(
  process.execPath,
  [
    resolve(repoRoot, 'scripts', 'supabase.mjs'),
    'functions',
    'serve',
    'ai-chat',
    '--no-verify-jwt',
    '--env-file',
    'supabase/functions/mock.env',
  ],
  {
    cwd: repoRoot,
    env: { ...process.env, DO_NOT_TRACK: '1' },
    stdio: 'inherit',
  },
);

const server = createServer((request, response) => {
  if (request.url !== '/health') {
    response.writeHead(404);
    response.end('not found');
    return;
  }
  if (!ready) {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'starting', reason: lastError }));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ status: 'ok' }));
});

server.listen(healthPort, '127.0.0.1');

child.on('exit', (code, signal) => {
  ready = false;
  server.close(() => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
});

try {
  await waitForAiChat();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unable to start ai-chat mock function.');
  child.kill();
  server.close(() => process.exit(1));
}
