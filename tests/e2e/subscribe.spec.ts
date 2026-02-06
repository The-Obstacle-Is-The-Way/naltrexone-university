import { expect, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { completeStripeCheckout } from './helpers/subscription';

test.describe('subscribe', () => {
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('user can subscribe and reach dashboard', async ({ page }) => {
    await signInWithClerkPassword(page);

    // Subscribe (monthly)
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();

    const alreadySubscribed = page.getByText("You're already subscribed");
    if (await alreadySubscribed.count()) {
      await page.getByRole('link', { name: 'Go to Dashboard' }).click();
      await expect(page).toHaveURL(/\/app\/dashboard/);
    } else {
      await page.getByRole('button', { name: 'Subscribe Monthly' }).click();
      await completeStripeCheckout(page);
    }

    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();
  });
});
