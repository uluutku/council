import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { offlineCases } from '../evals/ai/offline-cases.mjs';

const resultsDir = resolve('.local-test-results', 'ai-evals');
mkdirSync(resultsDir, { recursive: true });

const results = [];
let failed = false;
for (const testCase of offlineCases) {
  try {
    testCase.run();
    results.push({ name: testCase.name, status: 'PASS' });
  } catch (error) {
    failed = true;
    results.push({ name: testCase.name, status: 'FAIL', error: error.message });
  }
}

writeFileSync(
  resolve(resultsDir, 'offline-latest.json'),
  `${JSON.stringify({ kind: 'offline', results }, null, 2)}\n`,
);

for (const result of results) {
  console.log(`${result.status}: ${result.name}`);
}

if (failed) process.exit(1);
console.log(`PASS: ${results.length} offline AI behavior cases`);
