import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { getLocalSupabaseEnvironment } from './tests/e2e/helpers/localSupabase.js';

const port = 4173;
const localSupabase = getLocalSupabaseEnvironment();
const repositoryRoot = resolve(import.meta.dirname, '..', '..');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
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
      url: `http://127.0.0.1:${port}`,
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
      command:
        'node scripts/supabase.mjs functions serve ai-chat --no-verify-jwt --env-file supabase/functions/mock.env',
      url: `${localSupabase.apiUrl}/functions/v1/ai-chat`,
      cwd: repositoryRoot,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
