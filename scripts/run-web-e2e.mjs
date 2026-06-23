import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function envFlag(name, flag, args) {
  const value = process.env[name];
  if (!value || value === 'false') return;
  if (value === 'true') args.push(flag);
  else args.push(`${flag}=${value}`);
}

const forwarded = [...process.argv.slice(2)];
if (process.env.npm_config_grep && process.env.npm_config_grep !== 'true') {
  const index = forwarded.indexOf(process.env.npm_config_grep);
  if (index >= 0) forwarded.splice(index, 1);
}
envFlag('npm_config_list', '--list', forwarded);
envFlag('npm_config_retries', '--retries', forwarded);
envFlag('npm_config_repeat_each', '--repeat-each', forwarded);
if (process.env.npm_config_grep === 'true' && forwarded.length > 0) {
  forwarded.push(`--grep=${forwarded.shift()}`);
} else {
  envFlag('npm_config_grep', '--grep', forwarded);
}

const childEnv = { ...process.env };
for (const name of [
  'npm_config_grep',
  'npm_config_list',
  'npm_config_repeat_each',
  'npm_config_retries',
]) {
  delete childEnv[name];
}

const result = spawnSync(
  process.execPath,
  [resolve('node_modules', '@playwright', 'test', 'cli.js'), 'test', ...forwarded],
  {
    cwd: resolve('apps', 'web'),
    env: childEnv,
    stdio: 'inherit',
    shell: false,
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
