import { expect, test } from '@playwright/test';
import {
  deleteLocalUsersByEmail,
  createLocalPremiumCode,
  getLocalUserIdByEmail,
  setLocalAiCredits,
} from './helpers/localSupabase.js';
import { makeContacts, registerAndOnboard } from './helpers/contactsFlow.js';
import {
  attachImage as attachHumanImage,
  clickSend as clickHumanSend,
  openConversationFromContacts,
  sendMessage as sendHumanMessage,
} from './helpers/messagingFlow.js';

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

async function openMemory(page) {
  await page.getByRole('button', { name: 'Memory', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Memory' })).toBeVisible();
}

async function saveMemory(page, text, category = 'other') {
  await openMemory(page);
  await page.getByRole('button', { name: 'Add memory' }).click();
  await page.getByLabel('Category').selectOption(category);
  await page.getByLabel('Memory text').fill(text);
  await page.getByRole('button', { name: 'Save memory' }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
}

async function lastAssistant(page) {
  return page.locator('.ai-message-row[data-role="assistant"]').last();
}

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function attachImage(page, name = 'screen.png') {
  await page.locator('.ai-composer input[accept*="image/jpeg"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: tinyPng,
  });
  await expect(page.getByAltText(name)).toBeVisible();
  await expect(page.getByText(/will be sent to Council’s configured AI provider/i)).toBeVisible();
  await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 20_000 });
}

async function attachDocument(page, { name, mimeType, buffer }) {
  await page.locator('.ai-composer input[accept*="application/pdf"]').setInputFiles({
    name,
    mimeType,
    buffer,
  });
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByText(/Only files you explicitly send are analyzed/i)).toBeVisible();
  await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 20_000 });
}

test.describe('AI contacts and personas', () => {
  test.describe.configure({ mode: 'default' });
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

  test('renders streamed AI Markdown safely with tables and copyable code', async ({ browser }) => {
    test.setTimeout(90_000);
    const { context, page } = await newUserContext(browser, 'markdown');
    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openBuiltin(page, 'Council Assistant');
      await page
        .getByLabel('Message the assistant')
        .fill(
          'Reply with a heading, checklist, Markdown table, blockquote and JavaScript code block.',
        );
      await page.getByRole('button', { name: 'Send' }).click();
      const assistant = page.locator('.ai-message-row[data-role="assistant"]').last();
      await expect(assistant.getByRole('heading', { name: 'Safe Markdown demo' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(assistant.getByRole('checkbox')).toHaveCount(2);
      await expect(assistant.getByRole('table')).toBeVisible();
      await expect(assistant.getByRole('link', { name: 'Council' })).toHaveAttribute(
        'rel',
        'noopener noreferrer',
      );
      await expect(assistant.getByText('javascript', { exact: true })).toBeVisible();
      await assistant.getByRole('button', { name: 'Copy code' }).click();
      await expect(assistant.getByRole('status')).toHaveText('Code copied.');
      await expect(assistant.locator('img')).toHaveCount(0);
      await expect(assistant.locator('script')).toHaveCount(0);
      await expect(assistant.getByRole('link', { name: 'Unsafe' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('redeems a local Premium code and consumes the Premium credit pool', async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await newUserContext(browser, 'premium');
    try {
      const code = await createLocalPremiumCode({ days: 30, credits: 100 });
      await page.goto('/app/settings/access');
      await page.getByLabel('Premium access code').fill(code);
      await page.getByRole('button', { name: 'Redeem code' }).click();
      await expect(page.getByText('Premium access added.')).toBeVisible();
      await expect(page.getByRole('definition').filter({ hasText: '100' })).toBeVisible();

      await openBuiltin(page, 'Council Assistant');
      await sendAndAwait(page, 'Use one Premium credit.');
      await expect(page.getByText(/99 Premium credits remaining/i).first()).toBeVisible({
        timeout: 20_000,
      });

      await page.goto('/app/settings/access');
      await page.getByLabel('Premium access code').fill(code);
      await page.getByRole('button', { name: 'Redeem code' }).click();
      await expect(page.getByText('This access code is invalid or unavailable.')).toBeVisible();
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

  test('save curated memory, generate with it, disable memory, then delete it', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { context, page } = await newUserContext(browser, 'memory');
    try {
      await openBuiltin(page, 'Council Assistant');
      const memory = 'My preferred name is Utku.';
      await saveMemory(page, memory, 'personal_fact');

      await sendAndAwait(page, 'What name should you use for me?');
      await expect(await lastAssistant(page)).toContainText(memory);

      await openMemory(page);
      await page.getByLabel('Memory mode').selectOption('conversation_only');
      await page.getByRole('button', { name: 'Close' }).click();
      await sendAndAwait(page, 'What saved name do you have?');
      await expect(await lastAssistant(page)).toContainText('No approved memory was supplied');

      await openMemory(page);
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.getByText(/No saved memories/i)).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('memories stay isolated between AI contacts and user accounts', async ({ browser }) => {
    test.setTimeout(150_000);
    const a = await newUserContext(browser, 'memorya');
    const b = await newUserContext(browser, 'memoryb');
    try {
      await openBuiltin(a.page, 'Council Assistant');
      await saveMemory(a.page, 'Council-only memory.', 'project');

      await openBuiltin(a.page, 'Writing Editor');
      await openMemory(a.page);
      await expect(a.page.getByText(/No saved memories/i)).toBeVisible();
      await a.page.getByRole('button', { name: 'Close' }).click();
      await saveMemory(a.page, 'Editor-only memory.', 'preference');
      await sendAndAwait(a.page, 'What do you remember?');
      await expect(await lastAssistant(a.page)).toContainText('Editor-only memory.');
      await expect(await lastAssistant(a.page)).not.toContainText('Council-only memory.');

      await openBuiltin(a.page, 'Council Assistant');
      await sendAndAwait(a.page, 'What do you remember here?');
      await expect(await lastAssistant(a.page)).toContainText('Council-only memory.');
      await expect(await lastAssistant(a.page)).not.toContainText('Editor-only memory.');

      await openBuiltin(b.page, 'Council Assistant');
      await openMemory(b.page);
      await expect(b.page.getByText(/No saved memories/i)).toBeVisible();
      await expect(b.page.getByText('Council-only memory.', { exact: true })).toHaveCount(0);
      await expect(b.page.getByText('Editor-only memory.', { exact: true })).toHaveCount(0);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('an AI image prompt streams a response and persists after reload', async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await newUserContext(browser, 'image');
    try {
      await openBuiltin(page, 'Council Assistant');
      await attachImage(page);
      await page.getByLabel('Message the assistant').fill('What is in this image?');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(await lastAssistant(page)).toContainText('Vision analysis was supplied', {
        timeout: 30_000,
      });
      await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0, {
        timeout: 30_000,
      });

      await page.reload();
      await expect(page.getByText('What is in this image?', { exact: true })).toBeVisible();
      await expect(page.getByAltText('screen.png')).toBeVisible({ timeout: 20_000 });
      await expect(await lastAssistant(page)).toContainText('Vision analysis was supplied', {
        timeout: 20_000,
      });
    } finally {
      await context.close();
    }
  });

  test('invalid image selection is rejected and images stay isolated between users', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const a = await newUserContext(browser, 'imagea');
    const b = await newUserContext(browser, 'imageb');
    try {
      await openBuiltin(a.page, 'Council Assistant');
      const input = a.page.locator('.ai-composer input[accept*="image/jpeg"]');
      await input.setInputFiles({
        name: 'document.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('not an image'),
      });
      await expect(a.page.getByText(/must be a JPEG, PNG, or WebP/i)).toBeVisible();

      await input.setInputFiles({
        name: 'large.png',
        mimeType: 'image/png',
        buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
      });
      await expect(a.page.getByText(/larger than 5 MB/i)).toBeVisible();

      await attachImage(a.page, 'private.png');
      await a.page.getByLabel('Message the assistant').fill('Analyze privately.');
      await a.page.getByRole('button', { name: 'Send' }).click();
      await expect(await lastAssistant(a.page)).toContainText('Vision analysis was supplied', {
        timeout: 30_000,
      });

      await openBuiltin(b.page, 'Council Assistant');
      await expect(b.page.getByAltText('private.png')).toHaveCount(0);
      await expect(b.page.getByText('Analyze privately.', { exact: true })).toHaveCount(0);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('selects human messages, forwards to Council Assistant, streams, and persists the card', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const a = await newUserContext(browser, 'forwarda');
    const b = await newUserContext(browser, 'forwardb');
    try {
      await makeContacts(a.page, b.page, a.user, b.user);
      await openConversationFromContacts(a.page);
      await openConversationFromContacts(b.page);
      await sendHumanMessage(a.page, 'Decision: ship the focused flow.');
      await sendHumanMessage(b.page, 'Question: what remains unresolved?');
      await expect(
        a.page
          .getByRole('list', { name: 'Messages' })
          .getByText('Question: what remains unresolved?', { exact: true }),
      ).toBeVisible({
        timeout: 15_000,
      });

      await a.page.getByRole('button', { name: 'Select messages' }).click();
      for (const text of [
        'Decision: ship the focused flow.',
        'Question: what remains unresolved?',
      ]) {
        await a.page
          .locator('.message-row', { has: a.page.locator('.message-text', { hasText: text }) })
          .getByRole('checkbox')
          .check();
      }
      await a.page.getByRole('button', { name: 'Send to AI' }).click();
      const dialog = a.page.getByRole('dialog', { name: 'Review messages sent to AI' });
      await dialog.getByLabel('AI contact').selectOption({ label: 'Council Assistant' });
      await dialog
        .getByLabel('Question or instruction (optional)')
        .fill('Summarize the decisions and list the unresolved questions.');
      await dialog.getByRole('button', { name: 'Confirm and send' }).click();

      await a.page.waitForURL(/\/app\/ai\/[0-9a-f-]{36}/);
      await expect(a.page.getByText('Forwarded context · 2 messages')).toBeVisible();
      await expect(await lastAssistant(a.page)).toContainText('mock mode', { timeout: 30_000 });
      await expect(a.page.getByRole('button', { name: 'Stop' })).toHaveCount(0, {
        timeout: 30_000,
      });

      await a.page.reload();
      await expect(a.page.getByText('Forwarded context · 2 messages')).toBeVisible({
        timeout: 20_000,
      });
      await a.page.getByText('Forwarded context · 2 messages').click();
      await expect(
        a.page.getByText('Decision: ship the focused flow.', { exact: true }),
      ).toBeVisible();
      await expect(
        a.page.getByText('Question: what remains unresolved?', { exact: true }),
      ).toBeVisible();
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('excludes human attachments and denies the other participant access to the AI import', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const a = await newUserContext(browser, 'pforwarda');
    const b = await newUserContext(browser, 'pforwardb');
    try {
      await makeContacts(a.page, b.page, a.user, b.user);
      await openConversationFromContacts(a.page);
      await attachHumanImage(a.page, 'human-private.png');
      await a.page.getByLabel('Message', { exact: true }).fill('Only this text may be forwarded.');
      await clickHumanSend(a.page);
      await expect(
        a.page.getByText('Only this text may be forwarded.', { exact: true }),
      ).toBeVisible();

      await a.page.getByRole('button', { name: 'Select messages' }).click();
      await a.page
        .locator('.message-row', {
          has: a.page.locator('.message-text', { hasText: 'Only this text may be forwarded.' }),
        })
        .getByRole('checkbox')
        .check();
      await a.page.getByRole('button', { name: 'Send to AI' }).click();
      const dialog = a.page.getByRole('dialog', { name: 'Review messages sent to AI' });
      await expect(dialog.getByText(/Attachments are excluded/i)).toBeVisible();
      await dialog.getByLabel('AI contact').selectOption({ label: 'Council Assistant' });
      await dialog.getByRole('button', { name: 'Confirm and send' }).click();

      await a.page.waitForURL(/\/app\/ai\/[0-9a-f-]{36}/);
      const aiPath = new URL(a.page.url()).pathname;
      await expect(a.page.getByText('Forwarded context · 1 message')).toBeVisible();
      await a.page.getByText('Forwarded context · 1 message').click();
      await expect(a.page.getByText('Attachment excluded')).toBeVisible();
      await expect(a.page.getByAltText('human-private.png')).toHaveCount(0);

      await b.page.goto(aiPath);
      await expect(b.page.getByText('This AI conversation is unavailable.')).toBeVisible();
      await expect(
        b.page.getByText('Only this text may be forwarded.', { exact: true }),
      ).toHaveCount(0);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('uploads Markdown, receives an answer, and keeps the document after reload', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { context, page } = await newUserContext(browser, 'docmarkdown');
    try {
      await openBuiltin(page, 'Council Assistant');
      await attachDocument(page, {
        name: 'project-plan.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('# Plan\n\n- Ship safely\n- Review risks'),
      });
      await page.getByLabel('Message the assistant').fill('List the risks and next actions.');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(await lastAssistant(page)).toContainText(
        'Private document context was supplied',
        {
          timeout: 30_000,
        },
      );
      await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0, {
        timeout: 30_000,
      });

      await page.reload();
      await expect(page.getByText('project-plan.md', { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText(/Markdown/)).toBeVisible();
      await expect(await lastAssistant(page)).toContainText(
        'Private document context was supplied',
      );
    } finally {
      await context.close();
    }
  });

  test('parses a PDF, rejects unsupported files, and denies cross-user document access', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const a = await newUserContext(browser, 'docpdfa');
    const b = await newUserContext(browser, 'docpdfb');
    try {
      await openBuiltin(a.page, 'Council Assistant');
      await attachDocument(a.page, {
        name: 'report.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from(
          '%PDF-1.4\nMOCK_TEXT_START\nA text-based PDF for browser testing.\nMOCK_TEXT_END\n%%EOF',
        ),
      });
      await a.page.getByLabel('Message the assistant').fill('Summarize the report.');
      await a.page.getByRole('button', { name: 'Send' }).click();
      await expect(await lastAssistant(a.page)).toContainText(
        'Private document context was supplied',
        {
          timeout: 30_000,
        },
      );
      const ownerPath = new URL(a.page.url()).pathname;
      await expect(a.page.getByText('report.pdf', { exact: true })).toBeVisible();

      await a.page.locator('.ai-composer input[accept*="application/pdf"]').setInputFiles({
        name: 'unsafe.html',
        mimeType: 'text/html',
        buffer: Buffer.from('<script>unsafe</script>'),
      });
      await expect(a.page.getByText(/must be a PDF, TXT, or Markdown file/i)).toBeVisible();

      await b.page.goto(ownerPath);
      await expect(b.page.getByText('This AI conversation is unavailable.')).toBeVisible();
      await expect(b.page.getByText('report.pdf', { exact: true })).toHaveCount(0);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('saves, edits, revises, reloads, and restores an AI artifact', async ({ browser }) => {
    test.setTimeout(150_000);
    const { context, page } = await newUserContext(browser, 'artifactflow');
    try {
      await openBuiltin(page, 'Council Assistant');
      await page.getByLabel('Message the assistant').fill('Create a weekly plan.');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(await lastAssistant(page)).toContainText('Council Assistant', {
        timeout: 30_000,
      });
      await page.getByRole('button', { name: 'Save as artifact' }).last().click();
      await page.getByLabel('Artifact type').selectOption('plan');
      await page.getByLabel('Title').fill('Weekly launch plan');
      await page.getByRole('button', { name: 'Save artifact' }).click();
      await page.waitForURL(/\/app\/artifacts\/[0-9a-f-]{36}/);

      const editor = page.getByLabel('Current saved content');
      await editor.fill('Manual version of the weekly launch plan.');
      await page.getByRole('button', { name: 'Save manual revision' }).click();
      await expect(page.getByText(/Version 2/)).toBeVisible();

      const revisionInstruction = page.getByLabel('Revision instruction');
      await expect(revisionInstruction).toBeEditable();
      await revisionInstruction.fill('Make the plan more concise.');
      await page.getByRole('button', { name: 'Propose revision' }).click();
      await expect(page.getByRole('heading', { name: 'Proposed revision' })).toBeVisible();
      await page.getByRole('button', { name: 'Save revision' }).click();
      await expect(page.getByText(/Version 3/)).toBeVisible();

      await page.reload();
      await expect(page.getByText('Weekly launch plan', { exact: false })).toBeVisible();
      const restoreButtons = page.getByRole('button', { name: 'Restore' });
      await restoreButtons.last().click();
      await expect(page.getByText(/Version 4/)).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('exports a saved artifact and denies access to another user', async ({ browser }) => {
    test.setTimeout(150_000);
    const owner = await newUserContext(browser, 'artifactowner');
    const other = await newUserContext(browser, 'artifactother');
    try {
      await openBuiltin(owner.page, 'Writing Editor');
      await owner.page.getByLabel('Message the assistant').fill('Create a short checklist.');
      await owner.page.getByRole('button', { name: 'Send' }).click();
      await expect(await lastAssistant(owner.page)).toContainText('Council Assistant', {
        timeout: 30_000,
      });
      await owner.page.getByRole('button', { name: 'Save as artifact' }).last().click();
      await owner.page.getByLabel('Artifact type').selectOption('checklist');
      await owner.page.getByLabel('Title').fill('Release checklist');
      await owner.page.getByLabel('Content preview').fill('- [ ] Review\n- [x] Test');
      await owner.page.getByRole('button', { name: 'Save artifact' }).click();
      await owner.page.waitForURL(/\/app\/artifacts\/[0-9a-f-]{36}/);
      const artifactPath = new URL(owner.page.url()).pathname;

      const downloadPromise = owner.page.waitForEvent('download');
      await owner.page.getByRole('button', { name: 'Export Markdown' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('Release-checklist.md');

      await other.page.goto(artifactPath);
      await expect(other.page.getByText('This artifact is unavailable.')).toBeVisible();
      await expect(other.page.getByText('Release checklist')).toHaveCount(0);
    } finally {
      await owner.context.close();
      await other.context.close();
    }
  });
});
