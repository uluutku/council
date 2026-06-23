import { expect, test } from '@playwright/test';
import { deleteLocalUsersByEmail } from './helpers/localSupabase.js';
import { getLocalUserIdByEmail, setLocalPresence } from './helpers/localSupabase.js';
import { makeContacts, registerAndOnboard } from './helpers/contactsFlow.js';
import {
  messageInList,
  openConversationFromContacts,
  openInbox,
  sendMessage,
} from './helpers/messagingFlow.js';

const password = 'local-test-password';
const createdEmails = [];

function makeUser(prefix) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
  const email = `council-msg-${prefix}-${stamp}@example.test`;
  createdEmails.push(email);
  return {
    email,
    password,
    username: `${prefix}${stamp}`.slice(0, 20),
    displayName: `Msg ${prefix.toUpperCase()} ${stamp}`,
  };
}

async function newOnboardedUser(browser, prefix) {
  const user = makeUser(prefix);
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndOnboard(page, user);
  return { user, context, page };
}

// Creates two onboarded, accepted contacts.
async function makeContactPair(browser, prefix) {
  const a = await newOnboardedUser(browser, `${prefix}a`);
  const b = await newOnboardedUser(browser, `${prefix}b`);
  await makeContacts(a.page, b.page, a.user, b.user);
  return { a, b };
}

// Locates the message row whose own body (not a reply excerpt) contains text.
function ownMessageRow(page, text) {
  return page.locator('.message-row', {
    has: page.locator('.message-text', { hasText: text }),
  });
}

test.describe('realtime text messaging', () => {
  test.afterAll(async () => {
    // Best-effort cleanup: a transient admin-API hiccup must not fail the suite.
    try {
      await deleteLocalUsersByEmail(createdEmails);
    } catch {
      /* ignore cleanup errors */
    }
  });

  test('create a conversation, send, and the recipient sees unread then reads', async ({
    browser,
  }) => {
    const { a, b } = await makeContactPair(browser, 'c1');
    try {
      await openConversationFromContacts(a.page);
      await sendMessage(a.page, 'Hello from A');

      // B sees the conversation with an unread indicator.
      await openInbox(b.page);
      await expect(b.page.getByRole('link', { name: /Conversation with .*unread/ })).toBeVisible();

      // B opens it and sees the message.
      await b.page.getByRole('link', { name: /Conversation with/ }).click();
      await expect(messageInList(b.page, 'Hello from A')).toBeVisible();

      // Reading advances; the unread badge in the navigation clears live.
      await expect(b.page.getByRole('link', { name: /Messages.*unread/ })).toHaveCount(0);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('messages and replies are delivered in realtime without a refresh', async ({ browser }) => {
    test.setTimeout(60_000);
    const { a, b } = await makeContactPair(browser, 'c2');
    try {
      const path = await openConversationFromContacts(a.page);
      await openConversationFromContacts(b.page);

      await sendMessage(a.page, 'realtime ping');
      await expect(messageInList(b.page, 'realtime ping')).toBeVisible({ timeout: 15_000 });
      await expect(messageInList(b.page, 'realtime ping')).toHaveCount(1);

      await sendMessage(b.page, 'realtime pong');
      await expect(messageInList(a.page, 'realtime pong')).toBeVisible({ timeout: 15_000 });
      await expect(messageInList(a.page, 'realtime pong')).toHaveCount(1);

      // Both still point at the same single conversation.
      expect(new URL(b.page.url()).pathname).toBe(path);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('typing, presence, mute, filters, search, and notification settings work together', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { a, b } = await makeContactPair(browser, 'polish');
    try {
      await b.context.grantPermissions(['notifications'], {
        origin: 'http://127.0.0.1:4173',
      });
      await openConversationFromContacts(a.page);
      await openConversationFromContacts(b.page);

      const bUserId = await getLocalUserIdByEmail(b.user.email);
      await setLocalPresence(bUserId);
      await a.page.reload();
      await expect(a.page.locator('.conversation-header-presence')).toHaveText('Online', {
        timeout: 15_000,
      });
      await b.page.getByLabel('Message', { exact: true }).fill('typing draft');
      await expect(a.page.getByText(/is typing\.\.\./)).toBeVisible({ timeout: 10_000 });
      await b.page.getByLabel('Message', { exact: true }).blur();

      const searchable = `old searchable ${Date.now()}`;
      await sendMessage(a.page, searchable);
      await expect(messageInList(b.page, searchable)).toBeVisible({ timeout: 15_000 });

      await b.page.getByLabel('Mute conversation').selectOption('forever');
      await expect(b.page.getByLabel('Mute conversation')).toHaveValue('muted');
      await openInbox(b.page);
      await b.page.getByRole('button', { name: /Muted/ }).click();
      await expect(b.page.getByRole('button', { name: /Unmute/ })).toBeVisible();

      await b.page.getByRole('link', { name: 'Search' }).click();
      await b.page.getByRole('searchbox').fill(searchable);
      await b.page.locator('.message-search-groups a', { hasText: searchable }).click();
      await expect(ownMessageRow(b.page, searchable)).toHaveClass(/message-row--highlight/);

      await b.page.goto('/app/settings/preferences');
      await expect(b.page.getByText(/Browser permission:/)).toBeVisible();
      await expect(b.page.getByText(/while Council is open/i).first()).toBeVisible();
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('a failed send can be retried with the same client id and persists once', async ({
    browser,
  }) => {
    const { a, b } = await makeContactPair(browser, 'c3');
    try {
      await openConversationFromContacts(a.page);

      // Fail the first send_message attempt, then let retries through.
      let failed = false;
      await a.page.route('**/rest/v1/rpc/send_message', async (route) => {
        if (!failed) {
          failed = true;
          await route.abort('failed');
          return;
        }
        await route.fallback();
      });

      const composer = a.page.getByLabel('Message', { exact: true });
      await composer.fill('retry me');
      await composer.press('Enter');

      await expect(a.page.getByText('Not sent')).toBeVisible();
      await a.page.getByRole('button', { name: 'Retry' }).click();

      await expect(messageInList(a.page, 'retry me')).toHaveCount(1);
      await expect(a.page.getByText('Not sent')).toHaveCount(0);

      // Reload: exactly one persisted message.
      await a.page.reload();
      await expect(messageInList(a.page, 'retry me')).toHaveCount(1);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('replies stay linked through edit and deletion', async ({ browser }) => {
    test.setTimeout(60_000);
    const { a, b } = await makeContactPair(browser, 'c4');
    try {
      await openConversationFromContacts(a.page);
      await openConversationFromContacts(b.page);

      await sendMessage(a.page, 'alpha message');
      await expect(messageInList(b.page, 'alpha message')).toBeVisible({ timeout: 15_000 });

      // B replies to A's message.
      await ownMessageRow(b.page, 'alpha message').getByRole('button', { name: 'Reply' }).click();
      await sendMessage(b.page, 'beta reply');
      await expect(messageInList(a.page, 'beta reply')).toBeVisible({ timeout: 15_000 });

      // A edits the original; both clients see the edited content.
      const rowA = ownMessageRow(a.page, 'alpha message');
      await rowA.getByRole('button', { name: 'Edit' }).click();
      const editor = a.page.getByLabel('Edit message');
      await editor.fill('alpha edited');
      await a.page.getByRole('button', { name: 'Save' }).click();
      // Scope to the message body: the edited text also appears in the reply
      // excerpt that points at this message.
      await expect(a.page.locator('.message-text', { hasText: 'alpha edited' })).toBeVisible();
      await expect(b.page.locator('.message-text', { hasText: 'alpha edited' })).toBeVisible({
        timeout: 15_000,
      });

      // A deletes it; both see a tombstone and the reply remains.
      await ownMessageRow(a.page, 'alpha edited').getByRole('button', { name: 'Delete' }).click();
      await a.page.getByRole('dialog').getByRole('button', { name: 'Delete message' }).click();
      // The tombstone body; the same text also appears in the linked reply excerpt.
      await expect(a.page.locator('.message-deleted')).toBeVisible();
      await expect(b.page.locator('.message-deleted')).toBeVisible({ timeout: 15_000 });
      // The reply remains linked to the tombstone (excerpt shows "Message deleted").
      await expect(messageInList(b.page, 'beta reply')).toBeVisible();
      await expect(
        b.page.locator('.reply-preview-excerpt', { hasText: 'Message deleted' }),
      ).toBeVisible();
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('reactions are added and removed and reconcile on both clients', async ({ browser }) => {
    test.setTimeout(60_000);
    const { a, b } = await makeContactPair(browser, 'c5');
    try {
      await openConversationFromContacts(a.page);
      await openConversationFromContacts(b.page);

      await sendMessage(a.page, 'react to me');
      await expect(messageInList(b.page, 'react to me')).toBeVisible({ timeout: 15_000 });

      // B reacts; A sees the reaction.
      const rowB = ownMessageRow(b.page, 'react to me');
      await rowB.getByRole('button', { name: 'React' }).click();
      await b.page.getByRole('button', { name: /Thumbs up/ }).click();
      await expect(a.page.getByRole('button', { name: /Thumbs up, 1/ })).toBeVisible({
        timeout: 15_000,
      });

      // B removes it; A reconciles to no reaction.
      await b.page.getByRole('button', { name: /Thumbs up, 1/ }).click();
      await expect(a.page.getByRole('button', { name: /Thumbs up/ })).toHaveCount(0, {
        timeout: 15_000,
      });
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('removing a contact keeps history readable but disables sending', async ({ browser }) => {
    const { a, b } = await makeContactPair(browser, 'c6');
    try {
      const path = await openConversationFromContacts(a.page);
      await sendMessage(a.page, 'before removal');

      // A removes the contact.
      await a.page.goto('/app/contacts');
      await a.page.getByRole('button', { name: 'Remove' }).click();
      await a.page.getByRole('dialog').getByRole('button', { name: 'Remove contact' }).click();
      await expect(a.page.getByText('was removed from your contacts.')).toBeVisible();

      // History remains; the composer is replaced by a generic banner.
      await a.page.goto(path);
      await expect(
        a.page.getByText('Messaging is currently unavailable for this conversation.'),
      ).toBeVisible();
      await expect(messageInList(a.page, 'before removal')).toBeVisible();
      await expect(a.page.getByLabel('Message', { exact: true })).toHaveCount(0);

      // The sender can still delete their own old message.
      await ownMessageRow(a.page, 'before removal').getByRole('button', { name: 'Delete' }).click();
      await a.page.getByRole('dialog').getByRole('button', { name: 'Delete message' }).click();
      await expect(a.page.locator('.message-deleted')).toBeVisible();
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('blocking disables sending for both and discloses nothing to the blocked user', async ({
    browser,
  }) => {
    const { a, b } = await makeContactPair(browser, 'c7');
    try {
      const path = await openConversationFromContacts(a.page);
      await openConversationFromContacts(b.page);
      await sendMessage(a.page, 'shared history');
      await expect(messageInList(b.page, 'shared history')).toBeVisible({ timeout: 15_000 });

      // A blocks B.
      await a.page.goto('/app/contacts');
      await a.page.getByRole('button', { name: 'Block' }).click();
      await a.page.getByRole('dialog').getByRole('button', { name: 'Block user' }).click();
      await expect(a.page.getByText('is now blocked.')).toBeVisible();

      // Both retain readable history and lose sending.
      await a.page.goto(path);
      await expect(
        a.page.getByText('Messaging is currently unavailable for this conversation.'),
      ).toBeVisible();
      await expect(messageInList(a.page, 'shared history')).toBeVisible();

      await b.page.reload();
      await expect(
        b.page.getByText('Messaging is currently unavailable for this conversation.'),
      ).toBeVisible();
      await expect(messageInList(b.page, 'shared history')).toBeVisible();
      await expect(b.page.getByLabel('Message', { exact: true })).toHaveCount(0);

      // B is given no indication of a block.
      await expect(b.page.getByText(/block/i)).toHaveCount(0);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('reaccepting a contact reuses the existing conversation', async ({ browser }) => {
    test.setTimeout(60_000);
    const { a, b } = await makeContactPair(browser, 'c8');
    try {
      const path = await openConversationFromContacts(a.page);
      await sendMessage(a.page, 'first era');

      // Remove the contact relationship.
      await a.page.goto('/app/contacts');
      await a.page.getByRole('button', { name: 'Remove' }).click();
      await a.page.getByRole('dialog').getByRole('button', { name: 'Remove contact' }).click();
      await expect(a.page.getByText('was removed from your contacts.')).toBeVisible();

      // Re-establish the accepted relationship.
      await makeContacts(a.page, b.page, a.user, b.user);

      // The same conversation is reused (same path) and sending works again.
      const reopenedPath = await openConversationFromContacts(a.page);
      expect(reopenedPath).toBe(path);
      await expect(messageInList(a.page, 'first era')).toBeVisible();
      await sendMessage(a.page, 'second era');

      // B sees exactly one conversation — no duplicate was created.
      await openInbox(b.page);
      await expect(b.page.getByRole('link', { name: /Conversation with/ })).toHaveCount(1);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('reconnecting reconciles messages missed while offline', async ({ browser }) => {
    test.setTimeout(60_000);
    const { a, b } = await makeContactPair(browser, 'c9');
    try {
      await openConversationFromContacts(a.page);
      await openConversationFromContacts(b.page);
      await sendMessage(a.page, 'online baseline');
      await expect(messageInList(b.page, 'online baseline')).toBeVisible({ timeout: 15_000 });

      // B goes offline; A sends messages B cannot receive live.
      await b.context.setOffline(true);
      await sendMessage(a.page, 'missed one');
      await sendMessage(a.page, 'missed two');

      // B reconnects and reconciles from the database.
      await b.context.setOffline(false);
      await b.page.bringToFront();

      await expect(messageInList(b.page, 'missed one')).toBeVisible({ timeout: 25_000 });
      await expect(messageInList(b.page, 'missed two')).toBeVisible({ timeout: 25_000 });
      await expect(messageInList(b.page, 'missed one')).toHaveCount(1);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });
});
