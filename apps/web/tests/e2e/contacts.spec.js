import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { deleteLocalUsersByEmail } from './helpers/localSupabase.js';
import {
  acceptRequestFrom,
  makeContacts,
  registerAndOnboard,
  search,
  sendRequestTo,
} from './helpers/contactsFlow.js';

const password = 'local-test-password';
const createdEmails = [];

function makeUser(prefix) {
  const unique = `${randomBytes(8).toString('hex')}${Date.now().toString(36)}`;
  const safePrefix = prefix
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 10);
  const email = `council-contacts-${safePrefix}-${unique}@example.test`;
  createdEmails.push(email);
  return {
    email,
    password,
    username: `${safePrefix}_${unique}`.slice(0, 24),
    displayName: `Contact ${prefix.toUpperCase()} ${unique}`,
  };
}

async function newOnboardedUser(browser, prefix) {
  const user = makeUser(prefix);
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerAndOnboard(page, user);
  return { user, context, page };
}

test.describe('contact discovery and management', () => {
  test.afterAll(async () => {
    await deleteLocalUsersByEmail(createdEmails);
  });

  test('discovery, request, and acceptance connect two users', async ({ browser }) => {
    const a = await newOnboardedUser(browser, 'da');
    const b = await newOnboardedUser(browser, 'db');

    try {
      await sendRequestTo(a.page, b.user.username);
      await expect(
        a.page.getByText(`Contact request sent to ${b.user.displayName}.`),
      ).toBeVisible();

      await a.page.goto('/app/contacts/requests');
      const outgoing = a.page.getByRole('region', { name: 'Outgoing' });
      await expect(outgoing.getByText(`@${b.user.username}`)).toBeVisible();

      await acceptRequestFrom(b.page, a.user.username);
      await expect(b.page.getByText('You are now contacts with')).toBeVisible();

      await b.page.goto('/app/contacts');
      await expect(b.page.getByText(`@${a.user.username}`)).toBeVisible();

      await a.page.goto('/app/contacts');
      await expect(a.page.getByText(`@${b.user.username}`)).toBeVisible();
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('removing a contact leaves no block and allows reconnecting', async ({ browser }) => {
    const a = await newOnboardedUser(browser, 'ra');
    const b = await newOnboardedUser(browser, 'rb');

    try {
      await makeContacts(a.page, b.page, a.user, b.user);

      await a.page.goto('/app/contacts');
      await expect(a.page.getByText(`@${b.user.username}`)).toBeVisible();
      await a.page.getByRole('button', { name: 'Remove' }).click();
      await a.page.getByRole('dialog').getByRole('button', { name: 'Remove contact' }).click();

      await expect(a.page.getByText('was removed from your contacts.')).toBeVisible();
      await expect(a.page.getByText(`@${b.user.username}`)).toHaveCount(0);

      // No block exists: nobody appears on either blocked-users page.
      await a.page.goto('/app/settings/blocked');
      await expect(a.page.getByText('You have not blocked anyone.')).toBeVisible();

      // They can discover and request one another again.
      await search(a.page, b.user.username);
      await expect(a.page.getByText(`@${b.user.username}`)).toBeVisible();
      await expect(a.page.getByRole('button', { name: 'Add contact' })).toBeVisible();
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('blocking removes the relationship and hides both users from discovery', async ({
    browser,
  }) => {
    const a = await newOnboardedUser(browser, 'ba');
    const b = await newOnboardedUser(browser, 'bb');

    try {
      await makeContacts(a.page, b.page, a.user, b.user);

      await a.page.goto('/app/contacts');
      await expect(a.page.getByText(`@${b.user.username}`)).toBeVisible();
      await a.page.getByRole('button', { name: 'Block' }).click();
      await a.page.getByRole('dialog').getByRole('button', { name: 'Block user' }).click();
      await expect(a.page.getByText('is now blocked.')).toBeVisible();

      // The relationship is gone for A.
      await a.page.goto('/app/contacts');
      await expect(a.page.getByText(`@${b.user.username}`)).toHaveCount(0);

      // Neither direction can discover the other.
      await search(a.page, b.user.username);
      await expect(a.page.getByText('No people matched that search.')).toBeVisible();

      await search(b.page, a.user.username);
      await expect(b.page.getByText('No people matched that search.')).toBeVisible();

      // B's contact relationship disappeared, but B is given no hint of a block.
      await b.page.goto('/app/contacts');
      await expect(b.page.getByText(`@${a.user.username}`)).toHaveCount(0);

      // B's own blocked list never reveals the blocker.
      await b.page.goto('/app/settings/blocked');
      await expect(b.page.getByText('You have not blocked anyone.')).toBeVisible();
      await expect(b.page.getByText(`@${a.user.username}`)).toHaveCount(0);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('unblocking restores no relationship and re-enables discovery', async ({ browser }) => {
    const a = await newOnboardedUser(browser, 'ua');
    const b = await newOnboardedUser(browser, 'ub');

    try {
      await makeContacts(a.page, b.page, a.user, b.user);

      await a.page.goto('/app/contacts');
      await a.page.getByRole('button', { name: 'Block' }).click();
      await a.page.getByRole('dialog').getByRole('button', { name: 'Block user' }).click();
      await expect(a.page.getByText('is now blocked.')).toBeVisible();

      await a.page.goto('/app/settings/blocked');
      await expect(a.page.getByText(`@${b.user.username}`)).toBeVisible();
      await a.page.getByRole('button', { name: 'Unblock' }).click();
      await a.page.getByRole('dialog').getByRole('button', { name: 'Unblock' }).click();
      await expect(a.page.getByText('has been unblocked.')).toBeVisible();
      await expect(a.page.getByText(`@${b.user.username}`)).toHaveCount(0);

      // No relationship and no pending request are restored.
      await a.page.goto('/app/contacts');
      await expect(a.page.getByText(`@${b.user.username}`)).toHaveCount(0);
      await a.page.goto('/app/contacts/requests');
      await expect(a.page.getByText('No incoming requests.')).toBeVisible();
      await expect(a.page.getByText('No outgoing requests.')).toBeVisible();

      // Discovery works again.
      await search(a.page, b.user.username);
      await expect(a.page.getByText(`@${b.user.username}`)).toBeVisible();
      await expect(a.page.getByRole('button', { name: 'Add contact' })).toBeVisible();
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('disabling contact requests hides a stranger from discovery', async ({ browser }) => {
    const a = await newOnboardedUser(browser, 'pa');
    const b = await newOnboardedUser(browser, 'pb');

    try {
      // B opts out of stranger discovery.
      await b.page.goto('/app/settings/privacy');
      await b.page.getByLabel(/Allow contact requests/).uncheck();
      await b.page.getByRole('button', { name: 'Save privacy' }).click();
      await expect(b.page.getByText('Privacy saved.')).toBeVisible();

      await search(a.page, b.user.username);
      await expect(a.page.getByText('No people matched that search.')).toBeVisible();

      // B opts back in.
      await b.page.goto('/app/settings/privacy');
      await b.page.getByLabel(/Allow contact requests/).check();
      await b.page.getByRole('button', { name: 'Save privacy' }).click();
      await expect(b.page.getByText('Privacy saved.')).toBeVisible();

      await search(a.page, b.user.username);
      await expect(a.page.getByText(`@${b.user.username}`)).toBeVisible();
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });
});
