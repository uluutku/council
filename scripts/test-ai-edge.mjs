// Edge Function integration test for ai-chat in local mock mode.
//
// Serves the function with the deterministic mock provider, then drives it the
// way the browser does: authenticate, stream a completion, replay idempotently,
// reject cross-user access, and enforce credit exhaustion — all without calling
// any external provider. Refuses to run against a non-local Supabase project.

import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const repoRoot = resolve(import.meta.dirname, '..');
const supabaseScript = resolve(repoRoot, 'scripts', 'supabase.mjs');

function status() {
  const out = execFileSync(process.execPath, [supabaseScript, 'status', '--output', 'json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, DO_NOT_TRACK: '1' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

function assertLocal(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error('AI edge test is restricted to local Supabase.');
  }
  return url.replace(/\/$/, '');
}

const passed = [];
function check(label, condition) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed.push(label);
}

async function readSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) events.push(JSON.parse(trimmed.slice(5).trim()));
    }
  }
  return events;
}

const SAFE_CATEGORIES = new Set([
  'authentication_required',
  'invalid_request',
  'ai_conversation_not_found',
  'ai_agent_unavailable',
  'ai_run_in_progress',
  'trial_expired',
  'credits_exhausted',
  'rate_limited',
  'provider_unavailable',
  'provider_error',
  'provider_not_configured',
  'cancelled',
  'backend_unavailable',
]);

async function main() {
  const env = status();
  const apiUrl = assertLocal(env.API_URL);
  const anonKey = env.ANON_KEY;
  const serviceKey = env[['SERVICE', 'ROLE', 'KEY'].join('_')];
  const functionUrl = `${apiUrl}/functions/v1/ai-chat`;

  const admin = createClient(apiUrl, serviceKey, { auth: { persistSession: false } });

  let serve = null;
  const manage = process.env.AI_CHAT_SERVE !== '0';
  if (manage) {
    serve = spawn(
      process.execPath,
      [
        supabaseScript,
        'functions',
        'serve',
        'ai-chat',
        '--no-verify-jwt',
        '--env-file',
        'supabase/functions/mock.env',
      ],
      { cwd: repoRoot, env: { ...process.env, DO_NOT_TRACK: '1' }, stdio: 'ignore' },
    );
  }

  const createdUserIds = [];
  try {
    // Wait for the function to be reachable (an unauthenticated POST returns 401).
    let ready = false;
    for (let i = 0; i < 40; i += 1) {
      try {
        const probe = await fetch(functionUrl, { method: 'POST', body: '{}' });
        if (probe.status === 401 || probe.status === 400) {
          ready = true;
          break;
        }
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    check('function is serving', ready);

    async function makeUser(tag) {
      const email = `ai-edge-${tag}-${Date.now()}@example.test`;
      const password = 'local-test-password';
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      createdUserIds.push(created.user.id);
      const client = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
      const { data: session, error: signInError } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      return { client, token: session.session.access_token, id: created.user.id };
    }

    function post(token, body) {
      return fetch(functionUrl, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    }

    const alice = await makeUser('a');
    const bob = await makeUser('b');

    const { data: agents } = await alice.client.rpc('list_ai_agents');
    const agent = agents.find((a) => a.slug === 'council-assistant');
    check('built-in agent exists', Boolean(agent));

    const { data: conversation } = await alice.client
      .rpc('get_or_create_ai_conversation', { p_agent_id: agent.id })
      .single();

    // 1. Authentication required.
    const noAuth = await post(null, {
      conversation_id: conversation.id,
      client_message_id: crypto.randomUUID(),
      content: 'hi',
    });
    check('unauthenticated request is rejected (401)', noAuth.status === 401);

    // 2. Input validation.
    const badBody = await post(alice.token, { conversation_id: 'not-a-uuid', content: '' });
    check('invalid request body is rejected (400)', badBody.status === 400);

    // 3. Successful streamed completion + credit decrement.
    const clientMessageId = crypto.randomUUID();
    const first = await post(alice.token, {
      conversation_id: conversation.id,
      client_message_id: clientMessageId,
      content: 'Hello there',
    });
    check('generation responds with an event stream', first.status === 200);
    const events = await readSse(first);
    const types = events.map((e) => e.type);
    check('stream starts', types.includes('start'));
    check('stream has at least one delta', types.includes('delta'));
    const done = events.find((e) => e.type === 'done');
    check('stream completes with a done event', Boolean(done));
    check(
      'mock provider produced the deterministic reply',
      /mock mode/i.test(done.message.content),
    );
    check('one credit was consumed (20 -> 19)', done.credits_remaining === 19);

    // Persisted history contains the user + assistant messages.
    const { data: messages } = await alice.client.rpc('list_ai_messages', {
      p_conversation_id: conversation.id,
      p_limit: 100,
    });
    check('user and assistant messages persisted', messages.length === 2);

    // 4. Idempotent replay — same client id, no extra credit, same answer.
    const replay = await post(alice.token, {
      conversation_id: conversation.id,
      client_message_id: clientMessageId,
      content: 'Hello there',
    });
    const replayEvents = await readSse(replay);
    const replayDone = replayEvents.find((e) => e.type === 'done');
    check('replay still completes', Boolean(replayDone));
    check('replay does not consume another credit', replayDone.credits_remaining === 19);
    const { data: messagesAfterReplay } = await alice.client.rpc('list_ai_messages', {
      p_conversation_id: conversation.id,
      p_limit: 100,
    });
    check('replay creates no duplicate messages', messagesAfterReplay.length === 2);

    // 5. Cross-user access is denied.
    const intruder = await post(bob.token, {
      conversation_id: conversation.id,
      client_message_id: crypto.randomUUID(),
      content: 'let me in',
    });
    const intruderEvents = await readSse(intruder);
    const intruderError = intruderEvents.find((e) => e.type === 'error');
    check('cross-user request errors', Boolean(intruderError));
    check(
      'cross-user error is the generic not-found category',
      intruderError.category === 'ai_conversation_not_found',
    );

    // 6. Credit exhaustion is enforced server-side.
    await admin.rpc('admin_set_ai_credits', { p_user_id: alice.id, p_trial_credits_remaining: 0 });
    const exhausted = await post(alice.token, {
      conversation_id: conversation.id,
      client_message_id: crypto.randomUUID(),
      content: 'one more please',
    });
    const exhaustedEvents = await readSse(exhausted);
    const exhaustedError = exhaustedEvents.find((e) => e.type === 'error');
    check('exhausted trial is blocked', exhaustedError?.category === 'credits_exhausted');

    // 7. No raw provider error categories leaked anywhere.
    const allErrors = [...intruderEvents, ...exhaustedEvents, ...events, ...replayEvents]
      .filter((e) => e.type === 'error')
      .map((e) => e.category);
    check(
      'only safe error categories are exposed',
      allErrors.every((c) => SAFE_CATEGORIES.has(c)),
    );

    // Cleanup users.
    await Promise.all(createdUserIds.map((id) => admin.auth.admin.deleteUser(id).catch(() => {})));

    console.log(`AI edge integration passed (${passed.length} checks):`);
    for (const label of passed) console.log(`  ✓ ${label}`);
  } finally {
    if (serve && serve.pid) {
      try {
        execFileSync('taskkill', ['/PID', String(serve.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        serve.kill('SIGKILL');
      }
    }
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
