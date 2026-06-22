import { expect, test } from '@playwright/test';
import {
  deleteLocalUsersByEmail,
  getLocalUserIdByEmail,
  setLocalAiCredits,
} from './helpers/localSupabase.js';
import { registerAndOnboard } from './helpers/contactsFlow.js';

// These scenarios run against the ai-chat Edge Function in deterministic mock
// mode (served by the Playwright webServer), so no external provider is called.

const password = 'local-test-password';
const createdEmails = [];

function makeUser(prefix) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
  const email = `council-ai-${prefix}-${stamp}@example.test`;
  createdEmails.push(email);
  return {
    email,
    password,
    username: `${prefix}${stamp}`.slice(0, 20),
    displayName: `AI ${prefix.toUpperCase()} ${stamp}`,
  };
}

async function openAssistant(page) {
  await page.goto('/app/ai');
  await page.getByRole('button', { name: 'Open conversation' }).click();
  await page.waitForURL(/\/app\/ai\/[0-9a-f-]{36}/);
}

test.describe('AI contact', () => {
  test.afterAll(async () => {
    try {
      await deleteLocalUsersByEmail(createdEmails);
    } catch {
      /* ignore cleanup errors */
    }
  });

  test('streams a response from Council Assistant and persists it across reload', async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const user = makeUser('chat');
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await registerAndOnboard(page, user);
      await openAssistant(page);

      const composer = page.getByLabel('Message Council Assistant');
      await composer.fill('Help me plan my week');
      await composer.press('Enter');

      // The deterministic mock reply streams in and is identifiably an AI.
      await expect(page.getByText(/mock mode/i)).toBeVisible({ timeout: 20_000 });

      // Wait for the generation to finish (the credit drops 20 -> 19 on done)
      // so the assistant message is persisted before we reload.
      await expect(page.locator('.ai-access-credits').first()).toHaveText('19', {
        timeout: 20_000,
      });

      // The exchange persists after a reload. The user bubble matches exactly;
      // the assistant bubble echoes the prompt, so scope to the mock signature.
      await page.reload();
      await expect(page.getByText('Help me plan my week', { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText(/mock mode/i)).toBeVisible({ timeout: 20_000 });
    } finally {
      await context.close();
    }
  });

  test('blocks generation server-side when the trial is exhausted', async ({ browser }) => {
    test.setTimeout(60_000);
    const user = makeUser('exhausted');
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await registerAndOnboard(page, user);

      // Configure a started-but-exhausted trial through the trusted backend hook.
      const userId = await getLocalUserIdByEmail(user.email);
      await setLocalAiCredits(userId, {
        credits: 0,
        trialStartedAt: new Date(Date.now() - 1000).toISOString(),
        trialExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

      await openAssistant(page);

      // The server's access state is honored: the composer is withheld and the
      // honest exhausted message is shown — with no fake upgrade checkout.
      await expect(page.getByText(/trial credits are used up/i).first()).toBeVisible();
      await expect(page.getByLabel('Message Council Assistant')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /upgrade/i })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
