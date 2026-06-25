import { expect } from '@playwright/test';

// UI helpers shared by the contacts end-to-end scenarios. They drive the real
// application against local Supabase; no service-role helpers are imported here.

export async function registerAndOnboard(page, user) {
  await page.goto('/register');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByLabel('Confirm password').fill(user.password);
  await page.getByLabel(/acknowledge Council/).check();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Display name').fill(user.displayName);
  await page.getByRole('button', { name: 'Continue to Council' }).click();
  await expect(page).toHaveURL(/\/app\/messages$/);
}

export async function openDiscover(page) {
  await page.goto('/app/contacts/discover');
  await expect(page.getByRole('heading', { name: 'Discover people' })).toBeVisible();
}

export async function search(page, term) {
  await openDiscover(page);
  await page.getByLabel('Search people').fill(term);
}

export async function sendRequestTo(page, username) {
  await search(page, username);
  await expect(page.getByText(`@${username}`)).toBeVisible();
  await page.getByRole('button', { name: 'Add contact' }).click();
}

export async function acceptRequestFrom(page, username) {
  await page.goto('/app/contacts/requests');
  await expect(page.getByText(`@${username}`)).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
}

// Establishes an accepted relationship between two onboarded users.
export async function makeContacts(requesterPage, recipientPage, requester, recipient) {
  await sendRequestTo(requesterPage, recipient.username);
  await acceptRequestFrom(recipientPage, requester.username);
  await expect(recipientPage.getByText('You are now contacts with')).toBeVisible();
}
