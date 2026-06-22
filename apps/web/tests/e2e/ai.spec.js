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

// Opens (or reuses) a built-in contact's conversation from the catalogue.
async function openBuiltin(page, name) {
  await page.goto('/app/ai');
  await page
    .locator('.ai-agent-card', { hasText: name })
    .getByRole('button', { name: 'Open conversation' })
    .click();
  await page.waitForURL(/\/app\/ai\/[0-9a-f-]{36}/);
}

async function sendAndAwait(page, text) {
  const composer = page.getByLabel('Message the assistant');
  await composer.fill(text);
  await composer.press('Enter');
  // The deterministic mock reply streams in, then the run finishes (the Stop
  // control disappears) which means the assistant message has been persisted.
  await expect(page.getByText(/mock mode/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0, { timeout: 20_000 });
}

async function newUserContext(browser, prefix) {
  const user = makeUser(prefix);
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndOnboard(page, user);
  return { user, context, page };
}

test.describe('AI contacts and personas', () => {
  test.afterAll(async () => {
    try {
      await deleteLocalUsersByEmail(createdEmails);
    } catch {
      /* ignore cleanup errors */
    }
  });

  test('two built-in contacts keep separate, persistent histories', async ({ browser }) => {
    test.setTimeout(90_000);
    const { context, page } = await newUserContext(browser, 'multi');
    try {
      await openBuiltin(page, 'Council Assistant');
      await sendAndAwait(page, 'message for council');

      await openBuiltin(page, 'Writing Editor');
      await sendAndAwait(page, 'message for editor');

      // The Writing Editor conversation shows only its own message.
      await expect(page.getByText('message for editor', { exact: true })).toBeVisible();
      await expect(page.getByText('message for council', { exact: true })).toHaveCount(0);

      // Reopen Council Assistant: its own message persists; the editor's does not appear.
      await openBuiltin(page, 'Council Assistant');
      await expect(page.getByText('message for council', { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText('message for editor', { exact: true })).toHaveCount(0);

      // History survives a reload.
      await page.reload();
      await expect(page.getByText('message for council', { exact: true })).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await context.close();
    }
  });

  test('blocks generation server-side when the trial is exhausted', async ({ browser }) => {
    test.setTimeout(60_000);
    const { user, context, page } = await newUserContext(browser, 'exhausted');
    try {
      const userId = await getLocalUserIdByEmail(user.email);
      await setLocalAiCredits(userId, {
        credits: 0,
        trialStartedAt: new Date(Date.now() - 1000).toISOString(),
        trialExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

      await openBuiltin(page, 'Council Assistant');

      await expect(page.getByText(/trial credits are used up/i).first()).toBeVisible();
      await expect(page.getByLabel('Message the assistant')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /upgrade/i })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('create, chat, edit, archive and restore a private persona; another user cannot see it', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const a = await newUserContext(browser, 'owner');
    const b = await newUserContext(browser, 'other');
    try {
      // Create a private persona.
      await a.page.goto('/app/ai');
      await a.page.getByRole('tab', { name: 'My personas' }).click();
      await a.page.getByRole('button', { name: 'Create persona' }).click();
      await a.page.getByLabel('Name').fill('Focus Coach');
      await a.page.getByLabel('Instructions').fill('Keep me focused and ask one question.');
      await a.page.getByRole('button', { name: 'Save persona' }).click();

      // Open it and chat.
      const personaCard = a.page.locator('.ai-agent-card', { hasText: 'Focus Coach' });
      await expect(personaCard).toBeVisible({ timeout: 20_000 });
      await personaCard.getByRole('button', { name: 'Open', exact: true }).click();
      await a.page.waitForURL(/\/app\/ai\/[0-9a-f-]{36}/);
      await expect(a.page.locator('.ai-conversation-header').getByText('Custom')).toBeVisible({
        timeout: 10_000,
      });
      await sendAndAwait(a.page, 'help me focus');

      // Edit the persona.
      await a.page.goto('/app/ai');
      await a.page.getByRole('tab', { name: 'My personas' }).click();
      await a.page
        .locator('.ai-agent-card', { hasText: 'Focus Coach' })
        .getByRole('button', { name: 'Edit' })
        .click();
      await a.page.getByLabel('Instructions').fill('Be very direct and brief.');
      await a.page.getByRole('button', { name: 'Save persona' }).click();
      await expect(a.page.getByRole('button', { name: 'Create persona' })).toBeVisible();

      // Archive: history readable, generation disabled.
      await a.page
        .locator('.ai-agent-card', { hasText: 'Focus Coach' })
        .getByRole('button', { name: 'Archive' })
        .click();
      await a.page
        .locator('.ai-agent-card', { hasText: 'Focus Coach' })
        .getByRole('button', { name: 'View history' })
        .click();
      await a.page.waitForURL(/\/app\/ai\/[0-9a-f-]{36}/);
      await expect(a.page.getByText('help me focus', { exact: true })).toBeVisible();
      await expect(a.page.getByText(/archived, so new messages are paused/i)).toBeVisible();
      await expect(a.page.getByLabel('Message the assistant')).toHaveCount(0);

      // Restore: chatting works again.
      await a.page.goto('/app/ai');
      await a.page.getByRole('tab', { name: 'My personas' }).click();
      await a.page
        .locator('.ai-agent-card', { hasText: 'Focus Coach' })
        .getByRole('button', { name: 'Restore' })
        .click();
      await a.page
        .locator('.ai-agent-card', { hasText: 'Focus Coach' })
        .getByRole('button', { name: 'Open', exact: true })
        .click();
      await a.page.waitForURL(/\/app\/ai\/[0-9a-f-]{36}/);
      await expect(a.page.getByLabel('Message the assistant')).toBeVisible();

      // Another user cannot see the persona.
      await b.page.goto('/app/ai');
      await b.page.getByRole('tab', { name: 'My personas' }).click();
      await expect(b.page.getByText(/no custom personas yet/i)).toBeVisible();
      await expect(b.page.getByText('Focus Coach')).toHaveCount(0);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });
});
