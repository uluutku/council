import { expect } from '@playwright/test';

// UI helpers shared by the messaging end-to-end scenarios. They drive the real
// application against local Supabase; no service-role helpers are imported here.

const CONVERSATION_URL = /\/app\/messages\/[0-9a-f-]{36}/;

// Opens (or creates) the direct conversation with the user's single contact via
// the Contacts "Message" action and returns the conversation path.
export async function openConversationFromContacts(page) {
  await page.goto('/app/contacts');
  await page.getByRole('button', { name: 'Message' }).click();
  await page.waitForURL(CONVERSATION_URL);
  return new URL(page.url()).pathname;
}

export async function gotoConversation(page, path) {
  await page.goto(path);
  await expect(page.getByLabel('Messages')).toBeVisible();
}

// Scopes a text query to the message history list so it never matches the
// inbox sidebar's last-message preview (visible in the desktop split view).
export function messageInList(page, text) {
  return page.getByRole('list', { name: 'Messages' }).getByText(text, { exact: true });
}

export async function sendMessage(page, text) {
  const composer = page.getByLabel('Message', { exact: true });
  await composer.click();
  await composer.fill(text);
  await composer.press('Enter');
  await expect(messageInList(page, text)).toHaveCount(1);
}

export async function openInbox(page) {
  await page.goto('/app/messages');
  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
}

// A 1x1 transparent PNG — the smallest valid image for upload tests.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

// Selects a file into the (hidden) composer file input and waits for its upload
// to finalize so the message is ready to send.
export async function attachFile(page, { name, mimeType, base64, text }) {
  const buffer = base64 ? Buffer.from(base64, 'base64') : Buffer.from(text ?? '');
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
  await expect(page.locator('.attachment-draft-status', { hasText: 'Ready' }).first()).toBeVisible({
    timeout: 15_000,
  });
}

export async function attachImage(page, name = 'council-photo.png') {
  await attachFile(page, { name, mimeType: 'image/png', base64: TINY_PNG_BASE64 });
}

export async function attachTextFile(page, name = 'council-notes.txt') {
  await attachFile(page, { name, mimeType: 'text/plain', text: 'hello from council\n' });
}

export async function clickSend(page) {
  await page.getByRole('button', { name: 'Send', exact: true }).click();
}
