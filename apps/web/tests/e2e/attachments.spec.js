import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { deleteLocalUsersByEmail } from './helpers/localSupabase.js';
import { makeContacts, registerAndOnboard } from './helpers/contactsFlow.js';
import {
  attachImage,
  attachTextFile,
  clickSend,
  openConversationFromContacts,
} from './helpers/messagingFlow.js';

const password = 'local-test-password';
const createdEmails = [];

function makeUser(prefix) {
  const unique = `${randomBytes(8).toString('hex')}${Date.now().toString(36)}`;
  const safePrefix = prefix
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 10);
  const email = `council-att-${safePrefix}-${unique}@example.test`;
  createdEmails.push(email);
  return {
    email,
    password,
    username: `${safePrefix}_${unique}`.slice(0, 24),
    displayName: `Att ${prefix.toUpperCase()} ${unique}`,
  };
}

async function newOnboardedUser(browser, prefix) {
  const user = makeUser(prefix);
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndOnboard(page, user);
  return { user, context, page };
}

async function makeContactPair(browser, prefix) {
  const a = await newOnboardedUser(browser, `${prefix}a`);
  const b = await newOnboardedUser(browser, `${prefix}b`);
  await makeContacts(a.page, b.page, a.user, b.user);
  return { a, b };
}

function ownMessageRow(page, text) {
  return page.locator('.message-row', {
    has: page.locator('.message-text', { hasText: text }),
  });
}

test.describe('private message attachments', () => {
  test.afterAll(async () => {
    try {
      await deleteLocalUsersByEmail(createdEmails);
    } catch {
      /* ignore cleanup errors */
    }
  });

  test('an image is uploaded and delivered to the other user in realtime', async ({ browser }) => {
    test.setTimeout(60_000);
    const { a, b } = await makeContactPair(browser, 'i1');
    try {
      await openConversationFromContacts(a.page);
      await openConversationFromContacts(b.page);

      await attachImage(a.page, 'realtime-photo.png');
      await a.page.getByLabel('Message', { exact: true }).fill('look at this');
      await clickSend(a.page);

      // The sender sees the authoritative image and caption.
      await expect(a.page.getByAltText('realtime-photo.png')).toBeVisible({ timeout: 15_000 });

      // The recipient sees the image arrive without a refresh.
      await expect(b.page.getByAltText('realtime-photo.png')).toBeVisible({ timeout: 15_000 });
      await expect(
        b.page.getByRole('list', { name: 'Messages' }).getByText('look at this', { exact: true }),
      ).toBeVisible();
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('a document can be opened by a conversation member through a private signed URL', async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const { a, b } = await makeContactPair(browser, 'f1');
    try {
      await openConversationFromContacts(a.page);
      await openConversationFromContacts(b.page);

      await attachTextFile(a.page, 'shared-notes.txt');
      await clickSend(a.page);

      // The recipient sees the file card and can open it.
      const fileCard = b.page.locator('.attachment-file', { hasText: 'shared-notes.txt' });
      await expect(fileCard).toBeVisible({ timeout: 15_000 });

      const popupPromise = b.context.waitForEvent('page');
      await fileCard.getByRole('button', { name: 'Open' }).click();
      const popup = await popupPromise;
      await popup.waitForLoadState('domcontentloaded').catch(() => {});

      // Access is through a private, signed object URL — never a public one.
      expect(popup.url()).toContain('/storage/v1/object/sign/message-attachments/');
      expect(popup.url()).toContain('token=');
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('deleting a message removes the attachment for both users', async ({ browser }) => {
    test.setTimeout(60_000);
    const { a, b } = await makeContactPair(browser, 'd1');
    try {
      await openConversationFromContacts(a.page);
      await openConversationFromContacts(b.page);

      await attachImage(a.page, 'doomed-photo.png');
      await a.page.getByLabel('Message', { exact: true }).fill('delete me soon');
      await clickSend(a.page);

      await expect(b.page.getByAltText('doomed-photo.png')).toBeVisible({ timeout: 15_000 });

      // A deletes the message carrying the attachment.
      await ownMessageRow(a.page, 'delete me soon').getByRole('button', { name: 'Delete' }).click();
      await a.page.getByRole('dialog').getByRole('button', { name: 'Delete message' }).click();

      // Both sides see a tombstone and the image is gone.
      await expect(a.page.locator('.message-deleted')).toBeVisible();
      await expect(a.page.getByAltText('doomed-photo.png')).toHaveCount(0);
      await expect(b.page.locator('.message-deleted')).toBeVisible({ timeout: 15_000 });
      await expect(b.page.getByAltText('doomed-photo.png')).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });
});
