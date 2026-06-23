import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const repositoryRoot = resolve(import.meta.dirname, '../../../../..');
const supabaseScript = resolve(repositoryRoot, 'scripts', 'supabase.mjs');

function assertLocalUrl(value) {
  const url = new URL(value);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);

  if (url.protocol !== 'http:' || !localHosts.has(url.hostname)) {
    throw new Error('Playwright administration is restricted to local Supabase.');
  }

  return url.toString().replace(/\/$/, '');
}

export function getLocalSupabaseEnvironment() {
  const output = execFileSync(process.execPath, [supabaseScript, 'status', '--output', 'json'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, DO_NOT_TRACK: '1' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const status = JSON.parse(output);
  const apiUrl = assertLocalUrl(status.API_URL);
  const serviceRoleKey = status[['SERVICE', 'ROLE', 'KEY'].join('_')];

  if (!status.ANON_KEY || !serviceRoleKey) {
    throw new Error('Local Supabase keys are unavailable.');
  }

  return {
    apiUrl,
    anonKey: status.ANON_KEY,
    serviceRoleKey,
  };
}

export function createLocalAdminClient() {
  const environment = getLocalSupabaseEnvironment();
  return createClient(environment.apiUrl, environment.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function createLocalTestUser(email, password) {
  const admin = createLocalAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) throw error;
  return data.user;
}

export async function generateLocalRecoveryLink(email, redirectTo) {
  assertLocalUrl(redirectTo);
  const admin = createLocalAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });

  if (error) throw error;
  return assertLocalUrl(data.properties.action_link);
}

export async function getLocalUserIdByEmail(email) {
  const admin = createLocalAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email === email)?.id ?? null;
}

// Adjusts a user's AI trial/credit state through the sanctioned service-role
// function (the same hook future billing uses). Local-only by construction.
export async function setLocalAiCredits(userId, { credits, trialStartedAt, trialExpiresAt } = {}) {
  const admin = createLocalAdminClient();
  const { error } = await admin.rpc('admin_set_ai_credits', {
    p_user_id: userId,
    p_trial_credits_remaining: credits ?? null,
    p_trial_started_at: trialStartedAt ?? null,
    p_trial_expires_at: trialExpiresAt ?? null,
  });
  if (error) throw error;
}

export async function createLocalPremiumCode({ days = 30, credits = 100 } = {}) {
  const admin = createLocalAdminClient();
  const code = `COUNCIL-${randomBytes(24).toString('base64url').toUpperCase()}`;
  const hash = createHash('sha256').update(code).digest('hex');
  const { error } = await admin.rpc('create_premium_access_code', {
    p_code_hash: `\\x${hash}`,
    p_code_prefix: code.slice(0, 12),
    p_duration_days: days,
    p_ai_credits: credits,
    p_expires_at: null,
  });
  if (error) throw error;
  return code;
}

export async function setLocalPresence(userId, lastActiveAt = new Date().toISOString()) {
  const admin = createLocalAdminClient();
  const { error } = await admin.from('user_presence').upsert({
    user_id: userId,
    last_active_at: lastActiveAt,
    updated_at: lastActiveAt,
  });
  if (error) throw error;
}

export async function deleteLocalUsersByEmail(emails) {
  const admin = createLocalAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const targets = data.users.filter((user) => emails.includes(user.email));
  await Promise.all(
    targets.map(async (user) => {
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
      if (deleteError) throw deleteError;
    }),
  );
}
