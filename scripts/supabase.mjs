import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliEntry = resolve(repositoryRoot, 'node_modules', 'supabase', 'dist', 'supabase.js');
const result = spawnSync(process.execPath, [cliEntry, ...process.argv.slice(2)], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    DO_NOT_TRACK: '1',
  },
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
