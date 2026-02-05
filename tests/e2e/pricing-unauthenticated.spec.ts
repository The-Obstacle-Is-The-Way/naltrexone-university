import { expect, test } from '@playwright/test';

test('unauthenticated user is redirected to sign-up when starting checkout', async ({
  page,
}) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();

  const subscribeMonthly = page.getByRole('button', {
    name: 'Subscribe Monthly',
  });
  await expect(subscribeMonthly).toBeVisible();

  await subscribeMonthly.click();

  await expect(page).toHaveURL(/\/sign-up/, { timeout: 15_000 });
});
