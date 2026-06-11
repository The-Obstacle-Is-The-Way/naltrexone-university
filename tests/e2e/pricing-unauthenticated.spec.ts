import { expect, test } from '@playwright/test';

test('unauthenticated user is redirected to sign-up when starting checkout', async ({
  page,
}) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();

  const startTrial = page.getByRole('button', {
    name: 'Start 7-day free trial',
  });
  await expect(startTrial.first()).toBeVisible();

  await startTrial.first().click();

  await expect(page).toHaveURL(/\/sign-up/, { timeout: 15_000 });
});
