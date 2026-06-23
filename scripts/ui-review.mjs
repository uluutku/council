import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(import.meta.dirname, '..');
const reviewDir = resolve(repositoryRoot, '.local-test-results', 'ui-review');
mkdirSync(reviewDir, { recursive: true });

function run(command, args, { quiet = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, DO_NOT_TRACK: '1' },
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: process.platform === 'win32' && command === 'npm',
    encoding: quiet ? 'utf8' : undefined,
  });
  return result;
}

function supabaseRunning() {
  const result = run(process.execPath, ['scripts/supabase.mjs', 'status', '--output', 'json'], {
    quiet: true,
  });
  if (result.status !== 0) return false;
  try {
    const status = JSON.parse(result.stdout);
    const url = new URL(status.API_URL);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

const startedSupabase = !supabaseRunning();
if (startedSupabase) {
  console.log('Starting local Supabase for UI review...');
  const start = run(process.execPath, ['scripts/supabase.mjs', 'start'], { quiet: true });
  if (start.status !== 0) {
    process.stderr.write(start.stderr || start.stdout || 'Supabase failed to start.\n');
    process.exit(start.status ?? 1);
  }
}

const result = run(process.execPath, [
  resolve('node_modules', '@playwright', 'test', 'cli.js'),
  'test',
  '--config',
  resolve('apps', 'web', 'playwright.ui-review.config.js'),
]);

if (startedSupabase) {
  console.log('Stopping local Supabase started for UI review...');
  run(process.execPath, ['scripts/supabase.mjs', 'stop'], { quiet: true });
}

process.exit(result.status ?? 1);
