import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const envPath = resolve(repoRoot, 'supabase', 'functions', '.env');

function readEnvFile(path) {
  let source;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      'Missing supabase/functions/.env. Copy supabase/functions/.env.example and add the server-only provider settings.',
    );
  }

  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

try {
  const values = readEnvFile(envPath);
  const mode = (values.AI_PROVIDER_MODE || 'openrouter').toLowerCase();
  if (mode !== 'mock' && !values.OPENROUTER_API_KEY) {
    throw new Error(
      'OpenRouter mode requires OPENROUTER_API_KEY in supabase/functions/.env. The key was not loaded.',
    );
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
      'supabase/functions/.env',
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, DO_NOT_TRACK: '1' },
      stdio: 'inherit',
    },
  );

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unable to start the AI function.');
  process.exit(1);
}
