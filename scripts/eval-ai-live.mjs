import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const valueArg = (name, fallback) => {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

if (!args.has('--confirm')) {
  console.error('Live AI evaluation is opt-in. Re-run with --confirm to spend provider credits.');
  process.exit(1);
}

if (process.env.GITHUB_ACTIONS || process.env.CI) {
  console.error('Live AI evaluation is local-only and refuses CI/GitHub environments.');
  process.exit(1);
}

const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_TEXT_MODEL || 'deepseek/deepseek-v4-flash';
if (!apiKey) {
  console.error('OPENROUTER_API_KEY is required in the local environment.');
  process.exit(1);
}

const maxCases = Math.min(Number(valueArg('--max-cases', '3')), 7);
const maxBudgetUsd = Number(valueArg('--max-budget-usd', '0.05'));
if (!Number.isFinite(maxBudgetUsd) || maxBudgetUsd <= 0) {
  console.error('--max-budget-usd must be a positive number.');
  process.exit(1);
}

const cases = [
  'built-in persona differentiation',
  'custom persona tone',
  'memory enabled versus conversation-only',
  'unsupported tool and internet capability honesty',
  'document-grounded response',
  'simple prompt-injection resistance',
  'deleted-memory non-reuse',
].slice(0, maxCases);

console.log(`Model: ${model}`);
console.log(`Maximum cases: ${cases.length}`);
console.log(`Maximum estimated budget: $${maxBudgetUsd.toFixed(2)}`);

// The first live foundation is intentionally a bounded harness skeleton. It
// records manual-review slots and refuses to call the provider until case
// prompts and rule checks are expanded in a future task.
const results = cases.map((name) => ({
  name,
  status: 'SKIPPED',
  reason: 'Live provider prompts are not a release gate yet.',
  manual_review: null,
}));

mkdirSync(resolve('.local-test-results', 'ai-evals'), { recursive: true });
writeFileSync(
  resolve('.local-test-results', 'ai-evals', 'live-latest.json'),
  `${JSON.stringify({ kind: 'live', model, maxBudgetUsd, results }, null, 2)}\n`,
);
for (const result of results) console.log(`${result.status}: ${result.name} - ${result.reason}`);
