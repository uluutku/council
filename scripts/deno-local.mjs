import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const packageByPlatform = {
  'win32-x64': ['@deno', 'win32-x64', 'deno.exe'],
  'win32-arm64': ['@deno', 'win32-arm64', 'deno.exe'],
  'darwin-x64': ['@deno', 'darwin-x64', 'deno'],
  'darwin-arm64': ['@deno', 'darwin-arm64', 'deno'],
  'linux-x64': ['@deno', 'linux-x64-glibc', 'deno'],
  'linux-arm64': ['@deno', 'linux-arm64-glibc', 'deno'],
};

const key = `${process.platform}-${process.arch}`;
const packagePath = packageByPlatform[key];
if (!packagePath) {
  console.error(`No pinned Deno binary mapping for ${key}.`);
  process.exit(1);
}

const denoPath = resolve('node_modules', ...packagePath);
if (!existsSync(denoPath)) {
  console.error('Pinned local Deno binary is unavailable. Run npm install.');
  process.exit(1);
}

const result = spawnSync(denoPath, process.argv.slice(2), {
  cwd: resolve('.'),
  stdio: 'inherit',
  env: process.env,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
