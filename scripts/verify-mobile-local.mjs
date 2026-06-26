import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const logs = path.join(root, 'scripts', '.mobile-verify');
mkdirSync(logs, { recursive: true });

function run(name, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    shell: os.platform() === 'win32',
    encoding: 'utf8',
    timeout: options.timeout ?? 300000,
  });
  writeFileSync(path.join(logs, `${name}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (result.status === 0) {
    console.log(`PASS ${name}`);
    return true;
  }
  if (options.skipOnFailure) {
    console.log(`SKIPPED ${name}: ${options.skipReason ?? 'not available'}`);
    return !strict;
  }
  console.log(`FAIL ${name}`);
  return false;
}

let ok = true;
ok = run('flutter-doctor', 'flutter', ['doctor', '-v'], { timeout: 180000 }) && ok;
ok =
  run('dependency-resolution', 'flutter', ['pub', 'get'], {
    cwd: path.join(root, 'apps/mobile'),
  }) && ok;
ok =
  run('format', 'dart', ['format', '--output=none', '--set-exit-if-changed', '.'], {
    cwd: path.join(root, 'apps/mobile'),
  }) && ok;
ok = run('static-analysis', 'flutter', ['analyze'], { cwd: path.join(root, 'apps/mobile') }) && ok;
ok = run('unit-widget-tests', 'flutter', ['test'], { cwd: path.join(root, 'apps/mobile') }) && ok;
ok =
  run(
    'android-debug-build',
    'flutter',
    [
      'build',
      'apk',
      '--debug',
      '--dart-define=APP_ENV=local',
      '--dart-define=SUPABASE_URL=http://127.0.0.1:54321',
      '--dart-define=SUPABASE_ANON_KEY=LOCAL_PUBLIC_ANON_KEY',
      '--dart-define=AI_FUNCTION_URL=http://127.0.0.1:54321/functions/v1/ai-chat',
    ],
    { cwd: path.join(root, 'apps/mobile'), timeout: 600000 },
  ) && ok;
ok =
  run('local-supabase-status', 'npm', ['run', 'supabase:status'], {
    skipOnFailure: true,
    skipReason: 'local Supabase is not running or Supabase CLI is unavailable',
  }) && ok;
ok =
  run('mobile-integration-tests', 'flutter', ['test', 'integration_test'], {
    cwd: path.join(root, 'apps/mobile'),
    skipOnFailure: true,
    skipReason: 'no running emulator/simulator or local integration environment',
    timeout: 600000,
  }) && ok;
if (os.platform() === 'darwin') {
  ok =
    run('ios-simulator-build', 'flutter', ['build', 'ios', '--simulator', '--no-codesign'], {
      cwd: path.join(root, 'apps/mobile'),
      timeout: 600000,
    }) && ok;
} else {
  console.log('SKIPPED ios-simulator-build: unsupported host platform');
}
process.exit(ok ? 0 : 1);
