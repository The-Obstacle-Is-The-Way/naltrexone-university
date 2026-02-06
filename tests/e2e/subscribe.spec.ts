import { expect, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';

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

      await expect(page).toHaveURL(/stripe\.com/);

      // Stripe Checkout (test card)
      const cardNumber = page
        .frameLocator('iframe[name^="__privateStripeFrame"]')
        .locator('input[name="cardnumber"]');
      const expDate = page
        .frameLocator('iframe[name^="__privateStripeFrame"]')
        .locator('input[name="exp-date"]');
      const cvc = page
        .frameLocator('iframe[name^="__privateStripeFrame"]')
        .locator('input[name="cvc"]');
      const postal = page
        .frameLocator('iframe[name^="__privateStripeFrame"]')
        .locator('input[name="postal"]');

      if (await cardNumber.isVisible({ timeout: 10_000 })) {
        await cardNumber.fill('4242424242424242');
      }
      if (await expDate.isVisible({ timeout: 10_000 })) {
        await expDate.fill('1234');
      }
      if (await cvc.isVisible({ timeout: 10_000 })) {
        await cvc.fill('123');
      }
      if (await postal.isVisible({ timeout: 10_000 })) {
        await postal.fill('94107');
      }

      await page.getByRole('button', { name: /subscribe|pay/i }).click();

      // Success page syncs and redirects to dashboard
      await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 30_000 });
    }

    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();
  });
});
