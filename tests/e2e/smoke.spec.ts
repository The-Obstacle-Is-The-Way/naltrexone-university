import { expect, test } from '@playwright/test';

test('public pages load', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Master the Addiction Boards.' }),
  ).toBeVisible();

  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();
});
