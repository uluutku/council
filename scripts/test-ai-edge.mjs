// Edge Function integration test for ai-chat in local mock mode.
//
// Serves the function with the deterministic mock provider, then drives it the
// way the browser does: authenticate, stream a completion, replay idempotently,
// reject cross-user access, and enforce credit exhaustion — all without calling
// any external provider. Refuses to run against a non-local Supabase project.

import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { resolveProviderConfig } from '../supabase/functions/ai-chat/runtime-config.mjs';
import { createHash } from 'node:crypto';

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
  'invalid_image',
  'image_too_large',
  'unsupported_image',
  'image_unavailable',
  'vision_provider_unavailable',
  'idempotency_conflict',
]);

async function main() {
  const env = status();
  const apiUrl = assertLocal(env.API_URL);
  const anonKey = env.ANON_KEY;
  const serviceKey = env[['SERVICE', 'ROLE', 'KEY'].join('_')];
  const functionUrl = `${apiUrl}/functions/v1/ai-chat`;

  const admin = createClient(apiUrl, serviceKey, { auth: { persistSession: false } });

  const manage = process.env.AI_CHAT_SERVE !== '0';
  let serve = null;

  function startServe(envFile) {
    const childEnv = { ...process.env, DO_NOT_TRACK: '1' };
    delete childEnv.AI_PROVIDER_MODE;
    delete childEnv.OPENROUTER_API_KEY;
    return spawn(
      process.execPath,
      [supabaseScript, 'functions', 'serve', 'ai-chat', '--no-verify-jwt', '--env-file', envFile],
      { cwd: repoRoot, env: childEnv, stdio: 'ignore' },
    );
  }

  function stopServe() {
    if (!serve?.pid) return;
    try {
      execFileSync('taskkill', ['/PID', String(serve.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      serve.kill('SIGKILL');
    }
    serve = null;
  }

  async function waitForHealth(expectedMode) {
    for (let i = 0; i < 40; i += 1) {
      try {
        const probe = await fetch(functionUrl);
        if (probe.ok) {
          const metadata = await probe.json();
          if (metadata.provider_mode === expectedMode) return metadata;
        }
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Function did not start in ${expectedMode} mode.`);
  }

  const createdUserIds = [];
  try {
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

    const missingConfig = resolveProviderConfig({
      providerMode: '',
      model: '',
      apiKey: '',
      supabaseUrl: apiUrl,
    });
    check('missing provider mode defaults to OpenRouter', missingConfig.mode === 'openrouter');
    check(
      'the configured OpenRouter model is reported safely',
      missingConfig.model === 'deepseek/deepseek-v4-flash',
    );
    check(
      'the configured vision model is selected',
      missingConfig.visionModel === 'xiaomi/mimo-v2.5',
    );
    check(
      'missing OpenRouter key reports a safe configuration error',
      missingConfig.configured === false,
    );
    const remoteMock = resolveProviderConfig({
      providerMode: 'mock',
      model: '',
      apiKey: '',
      supabaseUrl: 'https://example.supabase.co',
    });
    check('mock mode is rejected for remote Supabase', remoteMock.configured === false);

    if (manage) {
      serve = startServe('supabase/functions/mock.env');
      const mockMetadata = await waitForHealth('mock');
      check(
        'mock mode requires explicit local configuration',
        mockMetadata.provider_mode === 'mock',
      );
      check('mock vision mode is explicit', mockMetadata.vision_model === 'mock/council-vision');
      await new Promise((resolveReady) => setTimeout(resolveReady, 1000));
    }

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

    const runId = events.find((event) => event.type === 'start')?.run_id;
    const { data: memory } = await alice.client
      .rpc('create_ai_memory', {
        p_conversation_id: conversation.id,
        p_category: 'preference',
        p_content: 'I prefer concise explanations.',
        p_source_message_id: null,
      })
      .single();
    const { data: curatedContext } = await admin
      .rpc('load_ai_run_context', { p_run_id: runId, p_max_messages: 20 })
      .single();
    check(
      'curated memory is included in server-side context',
      curatedContext.system_prompt.includes('I prefer concise explanations.'),
    );
    check(
      'platform prompt retains precedence over memory',
      curatedContext.system_prompt.indexOf('platform rules always apply') <
        curatedContext.system_prompt.indexOf('User-approved memory'),
    );

    await alice.client.rpc('set_ai_memory_mode', {
      p_conversation_id: conversation.id,
      p_memory_mode: 'conversation_only',
    });
    const { data: conversationOnlyContext } = await admin
      .rpc('load_ai_run_context', { p_run_id: runId, p_max_messages: 20 })
      .single();
    check(
      'conversation-only mode excludes memory',
      !conversationOnlyContext.system_prompt.includes('I prefer concise explanations.'),
    );
    await alice.client.rpc('set_ai_memory_mode', {
      p_conversation_id: conversation.id,
      p_memory_mode: 'curated',
    });
    await alice.client.rpc('delete_ai_memory', { p_memory_id: memory.id });
    const { data: deletedContext } = await admin
      .rpc('load_ai_run_context', { p_run_id: runId, p_max_messages: 20 })
      .single();
    check(
      'deleted memory is excluded',
      !deletedContext.system_prompt.includes('I prefer concise explanations.'),
    );

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

    // 5b. A custom persona shares the same per-user credit pool.
    const { data: persona } = await alice.client
      .rpc('create_custom_persona', {
        p_name: 'Edge Persona',
        p_description: 'integration test',
        p_instructions: 'Be brief and direct.',
        p_tone: 'direct',
        p_verbosity: 'concise',
      })
      .single();
    const { data: personaConv } = await alice.client
      .rpc('get_or_create_ai_conversation', { p_persona_id: persona.id })
      .single();
    check('persona conversation reports the custom kind', personaConv.kind === 'custom');
    await alice.client.rpc('create_ai_memory', {
      p_conversation_id: personaConv.id,
      p_category: 'project',
      p_content: 'Memory belonging only to the persona.',
      p_source_message_id: null,
    });
    const { data: isolatedContext } = await admin
      .rpc('load_ai_run_context', { p_run_id: runId, p_max_messages: 20 })
      .single();
    check(
      'memory from another conversation is excluded',
      !isolatedContext.system_prompt.includes('Memory belonging only to the persona.'),
    );

    const personaGen = await post(alice.token, {
      conversation_id: personaConv.id,
      client_message_id: crypto.randomUUID(),
      content: 'hello persona',
    });
    const personaEvents = await readSse(personaGen);
    const personaDone = personaEvents.find((e) => e.type === 'done');
    check('custom persona generation completes', Boolean(personaDone));
    check('credits are shared across contacts (19 -> 18)', personaDone.credits_remaining === 18);

    const uploadedPaths = [];
    const validPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );

    async function prepareImage({ bytes, filename, mimeType }) {
      const { data: target, error: reserveError } = await alice.client
        .rpc('create_ai_image_upload', {
          p_conversation_id: conversation.id,
          p_original_filename: filename,
          p_mime_type: mimeType,
          p_size_bytes: bytes.length,
        })
        .single();
      if (reserveError) throw reserveError;
      const { error: uploadError } = await alice.client.storage
        .from('ai-chat-images')
        .upload(target.storage_path, bytes, { contentType: mimeType, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPaths.push(target.storage_path);
      const { error: finalizeError } = await alice.client.rpc('finalize_ai_image_upload', {
        p_attachment_id: target.attachment_id,
        p_width: 1,
        p_height: 1,
      });
      if (finalizeError) throw finalizeError;
      return target;
    }

    const validImage = await prepareImage({
      bytes: validPng,
      filename: 'pixel.png',
      mimeType: 'image/png',
    });
    const imageResponse = await post(alice.token, {
      conversation_id: conversation.id,
      client_message_id: crypto.randomUUID(),
      content: 'Describe this image',
      attachment_ids: [validImage.attachment_id],
    });
    const imageEvents = await readSse(imageResponse);
    const imageDone = imageEvents.find((event) => event.type === 'done');
    check('valid image pipeline completes', Boolean(imageDone));
    const { data: imageHistory } = await alice.client.rpc('list_ai_messages', {
      p_conversation_id: conversation.id,
      p_limit: 100,
    });
    check(
      'image is attached to the persisted user message',
      imageHistory?.some((message) => message.attachments?.length === 1),
    );
    const imageRunId = imageEvents.find((event) => event.type === 'start')?.run_id;
    const { data: loadedImageAttachments, error: loadedImageError } = await admin.rpc(
      'load_ai_run_attachments',
      { p_run_id: imageRunId },
    );
    check(
      'service context loader returns the private image',
      !loadedImageError && loadedImageAttachments?.length === 1,
    );
    check(
      'private image was loaded and vision context reached the final text model',
      imageDone?.message?.content.includes('Vision analysis was supplied'),
    );
    check(
      'raw intermediate vision analysis is not streamed',
      !imageEvents.some((event) => JSON.stringify(event).includes('Mock visible text')),
    );
    check(
      'image generation consumes one shared credit (18 -> 17)',
      imageDone.credits_remaining === 17,
    );

    const retryPng = Buffer.concat([validPng, Buffer.from([1])]);
    const failingImage = await prepareImage({
      bytes: retryPng,
      filename: 'retry.png',
      mimeType: 'image/png',
    });
    const failingClientId = crypto.randomUUID();
    const failBody = {
      conversation_id: conversation.id,
      client_message_id: failingClientId,
      content: '[text-fail] analyze for retry',
      attachment_ids: [failingImage.attachment_id],
    };
    const failedFinal = await readSse(await post(alice.token, failBody));
    check(
      'final text failure after vision returns a safe category',
      failedFinal.find((event) => event.type === 'error')?.category === 'provider_unavailable',
    );
    check(
      'final text failure refunds the image generation credit',
      failedFinal.find((event) => event.type === 'error')?.credits_remaining === 17,
    );
    const imageSha = createHash('sha256').update(retryPng).digest('hex');
    const { data: cacheBefore } = await admin
      .from('ai_image_analyses')
      .select('id,created_at')
      .eq('user_id', alice.id)
      .eq('image_sha256', imageSha)
      .eq('vision_model', 'mock/council-vision');
    check('completed vision analysis is cached privately', cacheBefore?.length === 1);
    const failedRetry = await readSse(await post(alice.token, failBody));
    check(
      'failed generation retry still uses the safe final-provider error',
      failedRetry.find((event) => event.type === 'error')?.category === 'provider_unavailable',
    );
    const { data: cacheAfter } = await admin
      .from('ai_image_analyses')
      .select('id,created_at')
      .eq('user_id', alice.id)
      .eq('image_sha256', imageSha)
      .eq('vision_model', 'mock/council-vision');
    check(
      'retry reuses the single cached vision analysis',
      cacheAfter?.length === 1 && cacheAfter[0].id === cacheBefore[0].id,
    );

    const visionFailureImage = await prepareImage({
      bytes: Buffer.concat([validPng, Buffer.from([2])]),
      filename: 'vision-fail.png',
      mimeType: 'image/png',
    });
    const visionFailureEvents = await readSse(
      await post(alice.token, {
        conversation_id: conversation.id,
        client_message_id: crypto.randomUUID(),
        content: '[vision-fail] inspect',
        attachment_ids: [visionFailureImage.attachment_id],
      }),
    );
    check(
      'vision failure exposes only the safe category',
      visionFailureEvents.find((event) => event.type === 'error')?.category ===
        'vision_provider_unavailable',
    );
    check(
      'vision failure refunds the reserved credit',
      visionFailureEvents.find((event) => event.type === 'error')?.credits_remaining === 17,
    );

    const invalidImage = await prepareImage({
      bytes: Buffer.from('not-a-real-png'),
      filename: 'invalid.png',
      mimeType: 'image/png',
    });
    const invalidImageEvents = await readSse(
      await post(alice.token, {
        conversation_id: conversation.id,
        client_message_id: crypto.randomUUID(),
        content: 'inspect invalid image',
        attachment_ids: [invalidImage.attachment_id],
      }),
    );
    check(
      'invalid image bytes are rejected safely',
      invalidImageEvents.find((event) => event.type === 'error')?.category === 'invalid_image',
    );
    check(
      'invalid image rejection refunds the reserved credit',
      invalidImageEvents.find((event) => event.type === 'error')?.credits_remaining === 17,
    );

    // 5c. A different user cannot generate on the persona's conversation.
    const personaIntruder = await post(bob.token, {
      conversation_id: personaConv.id,
      client_message_id: crypto.randomUUID(),
      content: 'mine now',
    });
    const personaIntruderEvents = await readSse(personaIntruder);
    check(
      'cross-user persona conversation is rejected',
      personaIntruderEvents.find((e) => e.type === 'error')?.category ===
        'ai_conversation_not_found',
    );

    // 5d. An archived persona blocks new generation but history remains readable.
    await alice.client.rpc('archive_custom_persona', { p_persona_id: persona.id });
    const archivedGen = await post(alice.token, {
      conversation_id: personaConv.id,
      client_message_id: crypto.randomUUID(),
      content: 'after archive',
    });
    const archivedEvents = await readSse(archivedGen);
    check(
      'archived persona blocks new generation',
      archivedEvents.find((e) => e.type === 'error')?.category === 'ai_agent_unavailable',
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
    const allErrors = [
      ...intruderEvents,
      ...exhaustedEvents,
      ...events,
      ...replayEvents,
      ...personaIntruderEvents,
      ...archivedEvents,
      ...failedFinal,
      ...failedRetry,
      ...visionFailureEvents,
      ...invalidImageEvents,
    ]
      .filter((e) => e.type === 'error')
      .map((e) => e.category);
    check(
      'only safe error categories are exposed',
      allErrors.every((c) => SAFE_CATEGORIES.has(c)),
    );

    await admin.storage.from('ai-chat-images').remove(uploadedPaths);
    // Cleanup users.
    await Promise.all(createdUserIds.map((id) => admin.auth.admin.deleteUser(id).catch(() => {})));

    console.log(`AI edge integration passed (${passed.length} checks):`);
    for (const label of passed) console.log(`  ✓ ${label}`);
  } finally {
    stopServe();
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
