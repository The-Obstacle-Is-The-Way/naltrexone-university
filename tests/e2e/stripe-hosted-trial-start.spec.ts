import { expect, test } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { completeNoCardTrialCheckout } from './helpers/stripe-hosted-checkout';
import {
  expectE2EUserHasTrialWithoutPaymentMethod,
  resetE2EUserToFirstTimer,
  restoreE2EUserPaidSubscription,
} from './helpers/subscription';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

// Observational compatibility coverage for Stripe-owned, unsupported DOM.
// This file belongs only to the scheduled/manual stripe-hosted project.

test.describe('trial start', () => {
  // Hosted Stripe Checkout plus Clerk sign-in can take longer than app-only flows.
  test.setTimeout(120_000);

  test.beforeEach(async () => {
    await runE2EUserStateReset();
    await resetE2EUserToFirstTimer();
  });

  test.afterEach(async () => {
    await restoreE2EUserPaidSubscription();
  });

  test('first-time user starts a no-card trial and reaches the app with trial access', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);

    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();

    await page
      .getByRole('button', { name: 'Start 7-day free trial' })
      .first()
      .click();

    await completeNoCardTrialCheckout(page);

    await expect(
      page.getByRole('heading', {
        name: 'Your 7-day free trial has started — no charge today',
      }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveURL(/\/app\//, { timeout: 15_000 });
    await expect(page.getByText(/\d+ days? left in trial/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add a card to keep access' }),
    ).toBeVisible();

    await expectE2EUserHasTrialWithoutPaymentMethod();
  });
});
