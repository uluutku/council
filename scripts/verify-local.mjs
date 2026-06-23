import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const mode = process.argv.includes('--quick')
  ? 'quick'
  : process.argv.includes('--strict')
    ? 'strict'
    : 'normal';
const strict = mode === 'strict';
const repositoryRoot = resolve(import.meta.dirname, '..');
const resultsDir = resolve(repositoryRoot, '.local-test-results');
mkdirSync(resultsDir, { recursive: true });

const results = [];
let startedSupabase = false;
let stopping = false;

function record(name, status, reason = '') {
  results.push({ name, status, reason });
  const suffix = reason ? `\nReason: ${reason}` : '';
  console.log(`${status}: ${name}${suffix}`);
}

function run(command, args, { env = {}, logFile = null, quiet = false } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: { ...process.env, DO_NOT_TRACK: '1', ...env },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (!quiet) process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
      if (!quiet) process.stderr.write(chunk);
    });
    child.on('error', (error) => {
      output += `${error.message}\n`;
      if (logFile) writeFileSync(resolve(resultsDir, logFile), output);
      resolveRun({ ok: false, output, error });
    });
    child.on('close', (code) => {
      if (logFile) writeFileSync(resolve(resultsDir, logFile), output);
      resolveRun({ ok: code === 0, code, output });
    });
  });
}

async function runStage(name, command, args, options = {}) {
  console.log(`\n--- ${name} ---`);
  const result = await run(command, args, { name, ...options });
  record(name, result.ok ? 'PASS' : 'FAIL');
  return result.ok;
}

async function commandExists(command, args = ['--version']) {
  const result = await run(command, args, { quiet: true });
  return result.ok;
}

async function portAvailable(port) {
  return await new Promise((resolvePort) => {
    const server = createServer();
    server.once('error', () => resolvePort(false));
    server.once('listening', () => server.close(() => resolvePort(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function supabaseStatusOk() {
  const result = await run(
    process.execPath,
    ['scripts/supabase.mjs', 'status', '--output', 'json'],
    {
      quiet: true,
    },
  );
  if (!result.ok) return false;
  try {
    const status = JSON.parse(result.output);
    const apiUrl = new URL(status.API_URL);
    return (
      apiUrl.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(apiUrl.hostname)
    );
  } catch {
    return false;
  }
}

async function stopSupabaseIfStarted() {
  if (!startedSupabase || stopping) return;
  stopping = true;
  console.log('\n--- Stop Supabase ---');
  await run(process.execPath, ['scripts/supabase.mjs', 'stop']);
}

async function handleTermination(signal) {
  console.log(`\n${signal} received; stopping local services started by verifier.`);
  await stopSupabaseIfStarted();
  printSummary();
  process.exit(130);
}

process.on('SIGINT', () => void handleTermination('SIGINT'));
process.on('SIGTERM', () => void handleTermination('SIGTERM'));

async function ensureSupabase() {
  if (!existsSync(resolve(repositoryRoot, 'node_modules', 'supabase', 'dist', 'supabase.js'))) {
    record(
      'Supabase-dependent stages',
      'SKIPPED',
      'Supabase CLI package is not installed locally.',
    );
    return false;
  }
  if (!(await commandExists('docker', ['--version']))) {
    record('Supabase-dependent stages', 'SKIPPED', 'Docker CLI is not installed locally.');
    return false;
  }
  if (!(await commandExists('docker', ['info']))) {
    record('Supabase-dependent stages', 'SKIPPED', 'Docker daemon is not available.');
    return false;
  }

  const alreadyRunning = await supabaseStatusOk();
  if (!alreadyRunning && !(await portAvailable(54321))) {
    record('Supabase-dependent stages', 'SKIPPED', 'Required local port 54321 is unavailable.');
    return false;
  }

  if (!alreadyRunning) {
    const ok = await runStage(
      'Supabase startup',
      process.execPath,
      ['scripts/supabase.mjs', 'start'],
      {
        logFile: 'supabase-start.log',
      },
    );
    if (!ok) return false;
    startedSupabase = true;
  } else {
    record('Supabase startup', 'PASS', 'Local Supabase was already running.');
  }
  return true;
}

async function chromiumAvailable() {
  const result = await run(
    process.execPath,
    [
      '-e',
      "import('@playwright/test').then(({chromium})=>{const p=chromium.executablePath();import('node:fs').then(fs=>process.exit(fs.existsSync(p)?0:1));}).catch(()=>process.exit(1));",
    ],
    { quiet: true },
  );
  return result.ok;
}

function printSummary() {
  console.log('\nLocal verification summary');
  console.log('| Stage | Result | Reason |');
  console.log('| --- | --- | --- |');
  for (const result of results) {
    console.log(`| ${result.name} | ${result.status} | ${result.reason || ''} |`);
  }
  writeFileSync(
    resolve(resultsDir, 'verify-local-latest.json'),
    `${JSON.stringify(results, null, 2)}\n`,
  );
}

async function main() {
  await runStage('Format check', 'npm', ['run', 'format:check']);
  await runStage('Lint', 'npm', ['run', 'lint']);
  await runStage('Shared and frontend tests', 'npm', ['run', 'test']);
  await runStage('Production build', 'npm', ['run', 'build']);

  if (mode !== 'quick') {
    const supabaseReady = await ensureSupabase();
    if (supabaseReady) {
      const resetOk = await runStage('Database reset', 'npm', ['run', 'supabase:reset'], {
        logFile: 'supabase-reset.log',
      });
      if (resetOk) {
        await runStage('Schema lint', process.execPath, ['scripts/supabase.mjs', 'db', 'lint'], {
          logFile: 'schema-lint.log',
        });
        await runStage('Database and RLS tests', 'npm', ['run', 'db:test'], {
          logFile: 'db-test.log',
        });
        await runStage('AI Edge integration', 'npm', ['run', 'test:ai-edge'], {
          logFile: 'ai-edge.log',
        });
        await runStage('Messaging concurrency', 'npm', ['run', 'test:concurrency'], {
          logFile: 'concurrency.log',
        });
        if (await chromiumAvailable()) {
          await runStage('Playwright E2E', 'npm', ['run', 'test:e2e'], {
            logFile: 'playwright.log',
          });
        } else {
          record('Playwright E2E', 'SKIPPED', 'Chromium is not installed locally.');
        }
      } else {
        record('Schema lint', 'SKIPPED', 'Database reset failed.');
        record('Database and RLS tests', 'SKIPPED', 'Database reset failed.');
        record('AI Edge integration', 'SKIPPED', 'Database reset failed.');
        record('Messaging concurrency', 'SKIPPED', 'Database reset failed.');
        record('Playwright E2E', 'SKIPPED', 'Database reset failed.');
      }
    } else {
      record('Database reset', 'SKIPPED', 'Local Supabase prerequisites are unavailable.');
      record('Schema lint', 'SKIPPED', 'Local Supabase prerequisites are unavailable.');
      record('Database and RLS tests', 'SKIPPED', 'Local Supabase prerequisites are unavailable.');
      record('AI Edge integration', 'SKIPPED', 'Local Supabase prerequisites are unavailable.');
      record('Messaging concurrency', 'SKIPPED', 'Local Supabase prerequisites are unavailable.');
      record('Playwright E2E', 'SKIPPED', 'Local Supabase prerequisites are unavailable.');
    }
  }

  await stopSupabaseIfStarted();
  printSummary();
  const failed = results.some((result) => result.status === 'FAIL');
  const skipped = results.some((result) => result.status === 'SKIPPED');
  if (failed || (strict && skipped)) process.exit(1);
}

main().catch(async (error) => {
  console.error(error.message ?? error);
  await stopSupabaseIfStarted();
  printSummary();
  process.exit(1);
});
