import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { getLocalSupabaseEnvironment } from './tests/e2e/helpers/localSupabase.js';

function resolveAppOrigin() {
  const value = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid PLAYWRIGHT_BASE_URL: ${value}`);
  }
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error(`Playwright baseURL must be a local http origin: ${value}`);
  }
  if (!parsed.port) {
    throw new Error(`Playwright baseURL must include an explicit port: ${value}`);
  }
  return parsed.origin;
}

const appOrigin = resolveAppOrigin();
const port = Number(new URL(appOrigin).port);
const localSupabase = getLocalSupabaseEnvironment();
const appRoot = import.meta.dirname;
const repositoryRoot = resolve(import.meta.dirname, '..', '..');

export default defineConfig({
  testDir: resolve(appRoot, 'tests/e2e'),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: appOrigin,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
      url: appOrigin,
      cwd: appRoot,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_SUPABASE_URL: localSupabase.apiUrl,
        VITE_SUPABASE_ANON_KEY: localSupabase.anonKey,
      },
    },
    {
      // Serve the ai-chat Edge Function in deterministic mock mode for AI e2e.
      command: 'node scripts/serve-ai-chat-e2e.mjs',
      url: 'http://127.0.0.1:54329/health',
      cwd: repositoryRoot,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
