import { createHash, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

function integerFlag(name, fallback, minimum, maximum) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? fallback : Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

const days = integerFlag('days', 30, 1, 365);
const credits = integerFlag('credits', 100, 1, 1000);
const count = integerFlag('count', 1, 1, 100);
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const parsedUrl = new URL(url);
const local = ['127.0.0.1', 'localhost', '::1'].includes(parsedUrl.hostname);
const projectRef = parsedUrl.hostname.split('.')[0];
console.log(`Target Supabase project: ${url}`);
if (!local) {
  const prompt = createInterface({ input: stdin, output: stdout });
  const answer = await prompt.question(`Type ${projectRef} to create ${count} remote code(s): `);
  prompt.close();
  if (answer.trim() !== projectRef) throw new Error('Remote project confirmation did not match.');
}

const client = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const created = [];
for (let index = 0; index < count; index += 1) {
  const token = randomBytes(24).toString('base64url').toUpperCase();
  const code = `COUNCIL-${token}`;
  const hash = createHash('sha256').update(code).digest('hex');
  const { error } = await client.rpc('create_premium_access_code', {
    p_code_hash: `\\x${hash}`,
    p_code_prefix: code.slice(0, 12),
    p_duration_days: days,
    p_ai_credits: credits,
    p_expires_at: null,
  });
  if (error) throw new Error(`Code creation failed: ${error.message}`);
  created.push(code);
}

console.log(
  `Created ${created.length} code(s). Store them securely; they will not be shown again.`,
);
for (const code of created) console.log(code);
