import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const repositoryRoot = resolve(import.meta.dirname, '..');
const supabaseScript = resolve(repositoryRoot, 'scripts', 'supabase.mjs');
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);

function requireLocalUrl(value, protocols) {
  const url = new URL(value);
  if (!protocols.includes(url.protocol) || !localHosts.has(url.hostname)) {
    throw new Error(`Concurrency tests refuse non-local endpoint: ${url.origin}`);
  }
  return url;
}

function getEnvironment() {
  const output = execFileSync(process.execPath, [supabaseScript, 'status', '--output', 'json'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, DO_NOT_TRACK: '1' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const status = JSON.parse(output);
  const apiUrl = requireLocalUrl(status.API_URL, ['http:']).toString().replace(/\/$/, '');
  requireLocalUrl(status.DB_URL, ['postgres:', 'postgresql:']);
  const serviceRoleKey = status[['SERVICE', 'ROLE', 'KEY'].join('_')];

  if (!status.ANON_KEY || !serviceRoleKey) {
    throw new Error('Local Supabase credentials are unavailable.');
  }

  const databaseContainer = execFileSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .find((name) => name.startsWith('supabase_db_'));

  if (!databaseContainer) {
    throw new Error('Local Supabase database container is unavailable.');
  }

  return {
    apiUrl,
    anonKey: status.ANON_KEY,
    serviceRoleKey,
    databaseContainer,
  };
}

const environment = getEnvironment();
const admin = createClient(environment.apiUrl, environment.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function authenticatedClient() {
  return createClient(environment.apiUrl, environment.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function sqlScalar(sql) {
  return execFileSync(
    'docker',
    [
      'exec',
      environment.databaseContainer,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-X',
      '-A',
      '-t',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  ).trim();
}

function eventCount(event, conversationId) {
  return Number(
    sqlScalar(
      `select count(*) from realtime.messages where event = '${event}' and payload ->> 'conversation_id' = '${conversationId}'`,
    ),
  );
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

async function createUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

async function signIn(email, password) {
  const client = authenticatedClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function subscribePrivate(client, topic, eventNames, expectSubscribed = true) {
  await client.realtime.setAuth();
  const events = [];
  const channel = client.channel(topic, { config: { private: true } });

  for (const eventName of eventNames) {
    channel.on('broadcast', { event: eventName }, ({ payload }) => {
      events.push(payload);
    });
  }

  const status = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Realtime join timed out: ${topic}`)), 8000);
    channel.subscribe((nextStatus) => {
      if (
        nextStatus === 'SUBSCRIBED' ||
        nextStatus === 'CHANNEL_ERROR' ||
        nextStatus === 'TIMED_OUT' ||
        nextStatus === 'CLOSED'
      ) {
        clearTimeout(timeout);
        resolve(nextStatus);
      }
    }, 5000);
  });

  if (expectSubscribed) {
    assert.equal(status, 'SUBSCRIBED');
  } else {
    assert.notEqual(status, 'SUBSCRIBED');
  }

  return { channel, events };
}

async function waitFor(condition, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `local-concurrency-${randomUUID()}`;
const aliceEmail = `concurrency-alice-${runId}@example.test`;
const bobEmail = `concurrency-bob-${runId}@example.test`;
const charlieEmail = `concurrency-charlie-${runId}@example.test`;
const createdUserIds = [];

try {
  const [aliceUser, bobUser, charlieUser] = await Promise.all([
    createUser(aliceEmail, password),
    createUser(bobEmail, password),
    createUser(charlieEmail, password),
  ]);
  createdUserIds.push(aliceUser.id, bobUser.id, charlieUser.id);

  const [alice, bob, charlie] = await Promise.all([
    signIn(aliceEmail, password),
    signIn(bobEmail, password),
    signIn(charlieEmail, password),
  ]);

  await Promise.all([
    rpc(alice, 'set_my_profile', {
      username: `ca_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      display_name: 'Concurrency Alice',
      bio: null,
      avatar_path: null,
      status_text: null,
    }),
    rpc(bob, 'set_my_profile', {
      username: `cb_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      display_name: 'Concurrency Bob',
      bio: null,
      avatar_path: null,
      status_text: null,
    }),
  ]);

  await rpc(alice, 'send_contact_request', { target_user_id: bobUser.id });
  await rpc(bob, 'send_contact_request', { target_user_id: aliceUser.id });

  const [aliceInbox, bobInbox] = await Promise.all([
    subscribePrivate(alice, `user:${aliceUser.id}:inbox`, ['conversation.created']),
    subscribePrivate(bob, `user:${bobUser.id}:inbox`, ['conversation.created']),
  ]);
  await waitFor(
    () =>
      sqlScalar(
        "select coalesce((select active::text from pg_replication_slots where slot_name = 'supabase_realtime_messages_replication_slot_'), 'false')",
      ) === 'true',
    'local database Broadcast replication startup',
  );

  // Scenario A: reciprocal creation converges on one fully initialized row.
  const [aliceConversationRows, bobConversationRows] = await Promise.all([
    rpc(alice, 'create_or_get_direct_conversation', { target_user_id: bobUser.id }),
    rpc(bob, 'create_or_get_direct_conversation', { target_user_id: aliceUser.id }),
  ]);
  const conversationId = aliceConversationRows[0].conversation_id;
  assert.equal(bobConversationRows[0].conversation_id, conversationId);

  const pairCount = Number(
    sqlScalar(
      `select count(*) from public.direct_conversation_pairs where conversation_id = '${conversationId}'`,
    ),
  );
  const memberCount = Number(
    sqlScalar(
      `select count(*) from public.conversation_members where conversation_id = '${conversationId}'`,
    ),
  );
  assert.equal(pairCount, 1);
  assert.equal(memberCount, 2);
  assert.equal(eventCount('conversation.created', conversationId), 2);
  await waitFor(
    () => aliceInbox.events.length === 1 && bobInbox.events.length === 1,
    'private inbox creation broadcasts',
  );
  assert.equal(aliceInbox.events[0].conversation_id, conversationId);
  assert.equal(bobInbox.events[0].conversation_id, conversationId);

  const [aliceConversation, bobConversation] = await Promise.all([
    subscribePrivate(alice, `conversation:${conversationId}`, ['message.created']),
    subscribePrivate(bob, `conversation:${conversationId}`, ['message.created']),
  ]);
  const unauthorizedConversation = await subscribePrivate(
    charlie,
    `conversation:${conversationId}`,
    ['message.created'],
    false,
  );
  const unauthorizedInbox = await subscribePrivate(
    alice,
    `user:${bobUser.id}:inbox`,
    ['conversation.created'],
    false,
  );
  await Promise.all([
    charlie.removeChannel(unauthorizedConversation.channel),
    alice.removeChannel(unauthorizedInbox.channel),
  ]);

  // Scenario B: concurrent unique sends consume one contiguous sequence each.
  const uniqueSends = Array.from({ length: 20 }, (_, index) => {
    const client = index % 2 === 0 ? alice : bob;
    return rpc(client, 'send_message', {
      p_conversation_id: conversationId,
      p_client_message_id: randomUUID(),
      p_content: `concurrency-message-${index}`,
      p_reply_to_message_id: null,
    });
  });
  const sendResults = (await Promise.all(uniqueSends)).map(([row]) => row);
  assert.equal(new Set(sendResults.map((row) => row.id)).size, 20);
  assert.deepEqual(
    sendResults.map((row) => Number(row.sequence)).sort((a, b) => a - b),
    Array.from({ length: 20 }, (_, index) => index + 1),
  );

  assert.equal(
    Number(
      sqlScalar(`select count(*) from public.messages where conversation_id = '${conversationId}'`),
    ),
    20,
  );
  assert.equal(
    Number(
      sqlScalar(
        `select count(distinct sequence) from public.messages where conversation_id = '${conversationId}'`,
      ),
    ),
    20,
  );
  assert.equal(
    Number(
      sqlScalar(`select last_sequence from public.conversations where id = '${conversationId}'`),
    ),
    20,
  );
  assert.equal(eventCount('message.created', conversationId), 20);
  assert.equal(eventCount('conversation.changed', conversationId), 40);
  await waitFor(
    () => aliceConversation.events.length === 20 && bobConversation.events.length === 20,
    'private conversation message broadcasts',
  );

  // Scenario C: concurrent identical retries return one row and one event.
  const retryClientId = randomUUID();
  const retryCalls = Array.from({ length: 10 }, () =>
    rpc(alice, 'send_message', {
      p_conversation_id: conversationId,
      p_client_message_id: retryClientId,
      p_content: 'same idempotent payload',
      p_reply_to_message_id: null,
    }),
  );
  const retryResults = (await Promise.all(retryCalls)).map(([row]) => row);
  assert.equal(new Set(retryResults.map((row) => row.id)).size, 1);

  assert.equal(
    Number(
      sqlScalar(
        `select count(*) from public.messages where sender_user_id = '${aliceUser.id}' and client_message_id = '${retryClientId}'`,
      ),
    ),
    1,
  );
  assert.equal(
    Number(
      sqlScalar(
        `select sequence from public.messages where sender_user_id = '${aliceUser.id}' and client_message_id = '${retryClientId}'`,
      ),
    ),
    21,
  );
  assert.equal(eventCount('message.created', conversationId), 21);
  assert.equal(eventCount('conversation.changed', conversationId), 42);

  // Scenario D: one conflicting payload wins; no rejected retry consumes state.
  const conflictClientId = randomUUID();
  const conflictResults = await Promise.allSettled([
    rpc(alice, 'send_message', {
      p_conversation_id: conversationId,
      p_client_message_id: conflictClientId,
      p_content: 'conflict-a',
      p_reply_to_message_id: null,
    }),
    rpc(alice, 'send_message', {
      p_conversation_id: conversationId,
      p_client_message_id: conflictClientId,
      p_content: 'conflict-b',
      p_reply_to_message_id: null,
    }),
  ]);
  assert.equal(conflictResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(conflictResults.filter((result) => result.status === 'rejected').length, 1);

  assert.equal(
    Number(
      sqlScalar(
        `select count(*) from public.messages where sender_user_id = '${aliceUser.id}' and client_message_id = '${conflictClientId}'`,
      ),
    ),
    1,
  );
  assert.equal(
    Number(
      sqlScalar(
        `select sequence from public.messages where sender_user_id = '${aliceUser.id}' and client_message_id = '${conflictClientId}'`,
      ),
    ),
    22,
  );
  assert.ok(
    ['conflict-a', 'conflict-b'].includes(
      sqlScalar(
        `select content from public.messages where sender_user_id = '${aliceUser.id}' and client_message_id = '${conflictClientId}'`,
      ),
    ),
  );
  assert.equal(eventCount('message.created', conversationId), 22);
  assert.equal(eventCount('conversation.changed', conversationId), 44);

  // Scenario E: out-of-order receipt calls converge on the maximum valid state.
  const receiptCalls = [3, 22, 7, 18, 22, 11].map((sequence, index) =>
    rpc(bob, index % 2 === 0 ? 'mark_conversation_delivered' : 'mark_conversation_read', {
      p_conversation_id: conversationId,
      p_through_sequence: sequence,
    }),
  );
  await Promise.all(receiptCalls);

  const [lastDeliveredSequence, lastReadSequence] = sqlScalar(
    `select last_delivered_sequence || '|' || last_read_sequence from public.conversation_members where conversation_id = '${conversationId}' and user_id = '${bobUser.id}'`,
  )
    .split('|')
    .map(Number);
  assert.equal(lastDeliveredSequence, 22);
  assert.equal(lastReadSequence, 22);

  const receiptEventCount = Number(
    sqlScalar(
      `select count(*) from realtime.messages where event = 'receipt.changed' and payload ->> 'conversation_id' = '${conversationId}' and payload ->> 'entity_id' = '${bobUser.id}'`,
    ),
  );
  const distinctReceiptStates = Number(
    sqlScalar(
      `select count(distinct (payload ->> 'delivered_sequence', payload ->> 'read_sequence')) from realtime.messages where event = 'receipt.changed' and payload ->> 'conversation_id' = '${conversationId}' and payload ->> 'entity_id' = '${bobUser.id}'`,
    ),
  );
  assert.equal(receiptEventCount, distinctReceiptStates);
  assert.ok(receiptEventCount >= 1 && receiptEventCount <= receiptCalls.length + 10);

  process.stdout.write(
    'Concurrency scenarios passed: creation, 20 ordered sends, retries, conflicts, receipts.\n',
  );

  await Promise.all([
    alice.removeChannel(aliceInbox.channel),
    bob.removeChannel(bobInbox.channel),
    alice.removeChannel(aliceConversation.channel),
    bob.removeChannel(bobConversation.channel),
  ]);
} finally {
  for (const userId of createdUserIds) {
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch {
      // Local Auth cleanup is best-effort. Every run uses unique users and a
      // clean Supabase reset is part of the required acceptance sequence.
    }
  }
}
