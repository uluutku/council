import { expect, test } from '@playwright/test';
import {
  createLocalTestUser,
  deleteLocalUsersByEmail,
  generateLocalRecoveryLink,
} from './helpers/localSupabase.js';

test.describe('authentication and account settings', () => {
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const firstEmail = `council-e2e-${runId}@example.test`;
  const secondEmail = `council-e2e-conflict-${runId}@example.test`;
  const password = 'local-test-password';
  const updatedPassword = 'updated-local-password';
  const username = `user${runId.replace(/\D/g, '').slice(-10)}`;

  test.afterAll(async () => {
    await deleteLocalUsersByEmail([firstEmail, secondEmail]);
  });

  test('registration, onboarding, login, profile, preferences, and conflict flow', async ({
    browser,
    page,
  }) => {
    await test.step('register and complete onboarding', async () => {
      await page.goto('/register');
      await page.getByLabel('Email').fill(firstEmail);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByLabel('Confirm password').fill(password);
      await page.getByLabel(/acknowledge Council/).check();
      await page.getByRole('button', { name: 'Create account' }).click();

      await expect(page).toHaveURL(/\/onboarding$/);
      await page.getByLabel('Username').fill(username);
      await page.getByLabel('Display name').fill('Council Test User');
      await page.getByRole('button', { name: 'Continue to Council' }).click();

      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByRole('heading', { name: 'Welcome, Council Test User' })).toBeVisible();

      await page.reload();
      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByText(`@${username}`)).toBeVisible();
    });

    await test.step('logout, protected redirect, and login', async () => {
      await page.getByRole('button', { name: 'Log out' }).click();
      await expect(page).toHaveURL(/\/login$/);

      await page.goto('/app/settings/profile');
      await expect(page).toHaveURL(/\/login$/);

      await page.getByLabel('Email').fill(firstEmail);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Log in' }).click();
      await expect(page).toHaveURL(/\/app\/settings\/profile$/);
    });

    await test.step('profile changes persist through reload', async () => {
      await page.getByLabel('Display name').fill('Updated Council User');
      await page.getByLabel('Status').fill('Testing Council locally');
      await page.getByRole('button', { name: 'Save profile' }).click();
      await expect(page.getByText('Profile saved.')).toBeVisible();

      await page.reload();
      await expect(page.getByLabel('Display name')).toHaveValue('Updated Council User');
      await expect(page.getByLabel('Status')).toHaveValue('Testing Council locally');
      await expect(page.getByText('Updated Council User').first()).toBeVisible();
    });

    await test.step('preferences and theme persist through reload', async () => {
      await page.goto('/app/settings/preferences');
      await page.getByRole('button', { name: 'Dark' }).click();
      await page.getByLabel(/Allow contact requests/).uncheck();
      await page.getByRole('button', { name: 'Save preferences' }).click();
      await expect(page.getByText('Preferences saved.')).toBeVisible();

      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute(
        'data-selected',
        'true',
      );
      await expect(page.getByLabel(/Allow contact requests/)).not.toBeChecked();
    });

    await test.step('username conflict is reported clearly', async () => {
      await createLocalTestUser(secondEmail, password);
      const secondContext = await browser.newContext();
      const secondPage = await secondContext.newPage();

      try {
        await secondPage.goto('/login');
        await secondPage.getByLabel('Email').fill(secondEmail);
        await secondPage.getByLabel('Password').fill(password);
        await secondPage.getByRole('button', { name: 'Log in' }).click();

        await expect(secondPage).toHaveURL(/\/onboarding$/);
        await secondPage.getByLabel('Username').fill(username);
        await secondPage.getByRole('button', { name: 'Continue to Council' }).click();
        await expect(secondPage.getByText('That username is already in use.')).toBeVisible();
        await expect(secondPage).toHaveURL(/\/onboarding$/);
      } finally {
        await secondContext.close();
      }
    });

    await test.step('a valid recovery link updates the password', async () => {
      const recoveryLink = await generateLocalRecoveryLink(
        firstEmail,
        'http://127.0.0.1:4173/reset-password',
      );
      const recoveryContext = await browser.newContext();
      const recoveryPage = await recoveryContext.newPage();

      try {
        await recoveryPage.goto(recoveryLink);
        await expect(recoveryPage).toHaveURL(/\/reset-password/);
        await expect(
          recoveryPage.getByRole('heading', { name: 'Choose a new password' }),
        ).toBeVisible();
        await recoveryPage.getByLabel('New password', { exact: true }).fill(updatedPassword);
        await recoveryPage.getByLabel('Confirm new password').fill(updatedPassword);
        await recoveryPage.getByRole('button', { name: 'Update password' }).click();
        await expect(
          recoveryPage.getByRole('heading', { name: 'Your password has been changed' }),
        ).toBeVisible();
      } finally {
        await recoveryContext.close();
      }

      const loginContext = await browser.newContext();
      const loginPage = await loginContext.newPage();

      try {
        await loginPage.goto('/login');
        await loginPage.getByLabel('Email').fill(firstEmail);
        await loginPage.getByLabel('Password').fill(updatedPassword);
        await loginPage.getByRole('button', { name: 'Log in' }).click();
        await expect(loginPage).toHaveURL(/\/app$/);
      } finally {
        await loginContext.close();
      }
    });
  });
});
