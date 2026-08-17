import { expect, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import {
  completeNoCardTrialCheckout,
  expectE2EUserHasTrialWithoutPaymentMethod,
  resetE2EUserToFirstTimer,
  restoreE2EUserPaidSubscription,
} from './helpers/subscription';
import { assertLocalTrialCheckoutReplayCapacity } from './helpers/trial-checkout-replay-capacity';

test.describe('trial start', () => {
  // Hosted Stripe Checkout plus Clerk sign-in can take longer than app-only flows.
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test.beforeEach(async () => {
    await runE2EUserStateReset();
    await assertLocalTrialCheckoutReplayCapacity();
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
