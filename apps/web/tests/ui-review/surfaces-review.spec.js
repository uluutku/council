import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { deleteLocalUsersByEmail } from '../e2e/helpers/localSupabase.js';
import { registerAndOnboard } from '../e2e/helpers/contactsFlow.js';

// Best-effort visual-review capture for the redesigned non-messaging surfaces.
// These screenshots are review artifacts (not assertions): each capture is
// guarded so one slow route cannot abort the whole sweep.

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

async function setTheme(page, theme) {
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, theme);
}

async function settleApp(page) {
  // Wait for the persistent shell rail rather than per-page markup so captures
  // survive surface redesigns. Then give lazy routes + queries a moment.
  await expect(page.locator('.rail-link').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(700);
}

async function capture(page, name) {
  await page.screenshot({ path: resolve(screenshotDir, `${name}.png`), fullPage: false });
}

async function captureRoute(page, route, name, settle = settleApp) {
  try {
    await page.goto(route);
    await settle(page);
    await setTheme(page, 'light');
    await page.waitForTimeout(150);
    await capture(page, `${name}-light`);
    await setTheme(page, 'dark');
    await page.waitForTimeout(200);
    await capture(page, `${name}-dark`);
    await setTheme(page, 'light');
  } catch (error) {
    console.warn(`[ui-review] capture failed for ${route}: ${error.message}`);
  }
}

test.describe('surface UI review', () => {
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

  test('captures public auth surfaces', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    try {
      const publicSettle = async (p) => {
        await p.waitForLoadState('domcontentloaded');
        await p.waitForTimeout(500);
      };
      await captureRoute(page, '/login', 'auth-login', publicSettle);
      await captureRoute(page, '/register', 'auth-register', publicSettle);
      await captureRoute(page, '/forgot-password', 'auth-forgot', publicSettle);
    } finally {
      await context.close();
    }
  });

  test('captures onboarding surface', async ({ browser }) => {
    const user = makeUser('onb');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto('/register');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Password', { exact: true }).fill(user.password);
      await page.getByLabel('Confirm password').fill(user.password);
      await page.getByLabel(/acknowledge Council/).check();
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page).toHaveURL(/\/onboarding$/, { timeout: 15_000 });
      await page.waitForTimeout(500);
      await setTheme(page, 'light');
      await capture(page, 'onboarding-light');
      await setTheme(page, 'dark');
      await page.waitForTimeout(200);
      await capture(page, 'onboarding-dark');
    } catch (error) {
      console.warn(`[ui-review] onboarding capture failed: ${error.message}`);
    } finally {
      await context.close();
    }
  });

  test('captures authenticated surfaces (desktop, light + dark)', async ({ browser }) => {
    const user = makeUser('surf');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await registerAndOnboard(page, user);

      const routes = [
        ['/app/ai', 'ai-catalogue'],
        ['/app/contacts', 'contacts-list'],
        ['/app/contacts/discover', 'contacts-discover'],
        ['/app/contacts/requests', 'contacts-requests'],
        ['/app/artifacts', 'artifacts-list'],
        ['/app/settings', 'settings-profile'],
        ['/app/settings/preferences', 'settings-preferences'],
        ['/app/settings/access', 'settings-access'],
        ['/app/settings/security', 'settings-security'],
        ['/app/settings/blocked', 'settings-blocked'],
      ];
      for (const [route, name] of routes) {
        await captureRoute(page, route, name);
      }
    } finally {
      await context.close();
    }
  });

  test('captures key surfaces on mobile (light)', async ({ browser }) => {
    const user = makeUser('mob');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    try {
      await registerAndOnboard(page, user);
      const mobileSettle = async (p) => {
        await p.waitForTimeout(800);
      };
      for (const [route, name] of [
        ['/app/ai', 'mobile-ai-catalogue'],
        ['/app/contacts', 'mobile-contacts-list'],
        ['/app/settings', 'mobile-settings-profile'],
      ]) {
        try {
          await page.goto(route);
          await mobileSettle(page);
          await setTheme(page, 'light');
          await capture(page, `${name}-light`);
        } catch (error) {
          console.warn(`[ui-review] mobile capture failed for ${route}: ${error.message}`);
        }
      }
    } finally {
      await context.close();
    }
  });
});
