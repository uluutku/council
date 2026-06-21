import { expect, test } from '@playwright/test';

test('renders the Council shell and navigates to login', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Council' })).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Private messaging and persistent AI contacts in one application.',
    }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Log in' }).first().click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
});
