import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { deleteLocalUsersByEmail } from '../e2e/helpers/localSupabase.js';
import { makeContacts, registerAndOnboard } from '../e2e/helpers/contactsFlow.js';
import {
  messageInList,
  openConversationFromContacts,
  sendMessage,
} from '../e2e/helpers/messagingFlow.js';

const password = 'local-test-password';
const createdEmails = [];
const screenshotDir = resolve(import.meta.dirname, '../../../../.local-test-results/ui-review');

function makeUser(prefix) {
  const unique = randomBytes(8).toString('hex');
  const email = `council-ui-${prefix}-${unique}@example.test`;
  createdEmails.push(email);
  return {
    email,
    password,
    username: `${prefix}_${unique}`.slice(0, 24),
    displayName: `Review ${prefix.toUpperCase()} ${unique.slice(0, 4)}`,
  };
}

async function newUserContext(browser, prefix) {
  const user = makeUser(prefix);
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndOnboard(page, user);
  return { user, context, page };
}

async function capture(page, name) {
  await page.screenshot({ path: resolve(screenshotDir, `${name}.png`), fullPage: false });
}

async function waitForInbox(page) {
  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Conversation with/ }).first()).toBeVisible();
}

async function waitForConversation(page, expectedText) {
  await expect(page.getByRole('region', { name: /Conversation with/ })).toBeVisible();
  await expect(messageInList(page, expectedText)).toBeVisible();
}

test.describe('messenger UI review', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    mkdirSync(screenshotDir, { recursive: true });
  });

  test.afterAll(async () => {
    try {
      await deleteLocalUsersByEmail(createdEmails);
    } catch {
      /* best-effort local cleanup */
    }
  });

  test('captures redesigned messenger surfaces', async ({ browser }) => {
    const a = await newUserContext(browser, 'reviewa');
    const b = await newUserContext(browser, 'reviewb');
    const firstMessage = 'Here is a concise launch update with enough text to wrap cleanly.';
    const replyMessage =
      'Received. This reply includes a long URL: https://example.test/really/long/path/that/should/wrap/inside/the/message/bubble';

    try {
      await makeContacts(a.page, b.page, a.user, b.user);
      const path = await openConversationFromContacts(a.page);
      await sendMessage(a.page, firstMessage);

      await b.page.goto(path);
      await expect(b.page.getByRole('region', { name: /Conversation with/ })).toBeVisible();
      await sendMessage(b.page, replyMessage);
      await expect(messageInList(a.page, /Received\. This reply includes/)).toBeVisible({
        timeout: 15_000,
      });

      await a.page.setViewportSize({ width: 1440, height: 900 });
      await a.page.goto('/app/messages');
      await waitForInbox(a.page);
      await capture(a.page, 'desktop-inbox-light');

      await a.page.goto(path);
      await waitForConversation(a.page, firstMessage);
      await capture(a.page, 'desktop-conversation-light');

      await a.page.setViewportSize({ width: 1280, height: 800 });
      await waitForConversation(a.page, firstMessage);
      await capture(a.page, 'desktop-conversation-1280-light');

      await a.page.setViewportSize({ width: 1024, height: 768 });
      await waitForConversation(a.page, firstMessage);
      await capture(a.page, 'narrow-desktop-conversation-light');

      await a.page.setViewportSize({ width: 768, height: 1024 });
      await waitForConversation(a.page, firstMessage);
      await capture(a.page, 'tablet-conversation-light');

      await a.page.setViewportSize({ width: 430, height: 932 });
      await a.page.goto('/app/messages');
      await waitForInbox(a.page);
      await capture(a.page, 'mobile-inbox-430-light');

      await a.page.goto(path);
      await waitForConversation(a.page, firstMessage);
      await capture(a.page, 'mobile-conversation-430-light');

      await a.page.setViewportSize({ width: 390, height: 844 });
      await a.page.goto('/app/messages');
      await waitForInbox(a.page);
      await capture(a.page, 'mobile-inbox-light');

      await a.page.goto(path);
      await waitForConversation(a.page, firstMessage);
      await capture(a.page, 'mobile-conversation-light');

      await a.page.setViewportSize({ width: 360, height: 800 });
      await waitForConversation(a.page, firstMessage);
      await capture(a.page, 'mobile-conversation-360-light');

      await a.page.setViewportSize({ width: 1440, height: 900 });
      await waitForConversation(a.page, firstMessage);
      await a.page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
      });
      await capture(a.page, 'desktop-conversation-dark');
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });
});
