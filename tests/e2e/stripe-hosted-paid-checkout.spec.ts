import { expect, test } from '@playwright/test';
import {
  expectE2ECheckoutConsent,
  readDisplayedPlanConsent,
} from './helpers/checkout-consent';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import {
  expectE2EUserHasPaidAnnualSubscription,
  prepareE2EUserForPaidCheckout,
  restoreE2EUserAfterPaidCheckout,
} from './helpers/paid-checkout';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import {
  acceptHostedCheckoutTerms,
  fillHostedCheckoutTestCard,
} from './helpers/stripe-hosted-checkout';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

// Observational compatibility coverage for Stripe-owned, unsupported DOM.
// This file belongs only to the scheduled/manual stripe-hosted project.

test.describe
  .serial('paid annual checkout', () => {
    // Clerk sign-in, hosted card entry, eager sync, and app entitlement span three origins.
    test.setTimeout(120_000);

    test.beforeEach(async () => {
      await runE2EUserStateReset();
      await prepareE2EUserForPaidCheckout();
    });

    test.afterEach(async () => {
      await restoreE2EUserAfterPaidCheckout();
    });

    test('charges the annual plan, provisions its subscription, and grants app access', async ({
      page,
    }) => {
      await signInWithClerkPassword(page);
      await page.goto('/pricing');

      await expect(
        page.getByRole('heading', { name: 'Pricing' }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Subscribe annual', exact: true })
        .click();
      const displayedConsent = await readDisplayedPlanConsent(page);
      // DEBT-414 F03: the separate renewal opt-in.
      await page.getByRole('dialog').getByRole('checkbox').check();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Subscribe', exact: true })
        .click();

      await expect(page).toHaveURL(/checkout\.stripe\.com/, {
        timeout: 30_000,
      });
      await fillHostedCheckoutTestCard(page);
      await acceptHostedCheckoutTerms(page);
      await page
        .getByRole('button', { name: 'Subscribe', exact: true })
        .click();

      await expect(
        page.getByRole('heading', {
          name: 'You’re all set — your subscription is active',
        }),
      ).toBeVisible({ timeout: 30_000 });

      await expectE2EUserHasPaidAnnualSubscription();
      await expectE2ECheckoutConsent(page, {
        plan: 'annual',
        ...displayedConsent,
      });

      await expect(page).toHaveURL(/\/app\/dashboard$/, { timeout: 15_000 });
      await page.goto('/app/practice');
      await expect(
        page.getByRole('heading', { name: 'Practice' }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/app\/practice$/);
    });
  });
