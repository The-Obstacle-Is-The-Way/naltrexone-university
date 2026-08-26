import { expect, test } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import {
  prepareE2EUserForPaidCheckout,
  restoreE2EUserAfterPaidCheckout,
} from './helpers/paid-checkout';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { resetE2EUserToFirstTimer } from './helpers/subscription';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

test.describe
  .serial('Stripe Checkout redirect boundary', () => {
    // Clerk sign-in plus real Checkout Session creation can exceed the default budget.
    test.setTimeout(120_000);
    test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

    test.beforeEach(async () => {
      await runE2EUserStateReset();
    });

    test.afterEach(async () => {
      await restoreE2EUserAfterPaidCheckout();
    });

    test('first-time trial CTA redirects to Stripe Checkout', async ({
      page,
    }) => {
      await resetE2EUserToFirstTimer();
      await signInWithClerkPassword(page);
      await page.goto('/pricing');

      await page
        .getByRole('button', { name: 'Start 7-day free trial' })
        .first()
        .click();

      // Stripe owns everything after this origin boundary. Required CI stops here.
      await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//, {
        timeout: 30_000,
      });
    });

    test('returning-user annual CTA redirects to Stripe Checkout', async ({
      page,
    }) => {
      await prepareE2EUserForPaidCheckout();
      await signInWithClerkPassword(page);
      await page.goto('/pricing');

      const annualForm = page.locator(
        'form[aria-label="Subscribe annual plan"]',
      );
      await annualForm
        .getByRole('button', { name: 'Subscribe Annual' })
        .click();

      // Stripe owns everything after this origin boundary. Required CI stops here.
      await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//, {
        timeout: 30_000,
      });
    });
  });
