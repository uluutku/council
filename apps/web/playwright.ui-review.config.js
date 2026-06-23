import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config.js';

export default defineConfig({
  ...baseConfig,
  testDir: resolve(import.meta.dirname, 'tests/ui-review'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: resolve(import.meta.dirname, '../../.local-test-results/ui-review/playwright'),
});
