import { expect, test } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import {
  expectE2EUserHasPaidAnnualSubscription,
  prepareE2EUserForPaidCheckout,
  restoreE2EUserAfterPaidCheckout,
} from './helpers/paid-checkout';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

// Observational compatibility coverage for Stripe-owned, unsupported DOM.
// This file belongs only to the scheduled/manual stripe-hosted project.

test.describe
  .serial('paid annual checkout', () => {
    // Clerk sign-in, hosted card entry, eager sync, and app entitlement span three origins.
    test.setTimeout(120_000);
    test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

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
      const annualForm = page.locator(
        'form[aria-label="Subscribe annual plan"]',
      );
      await expect(
        annualForm.getByRole('button', { name: 'Subscribe Annual' }),
      ).toBeVisible();
      await annualForm
        .getByRole('button', { name: 'Subscribe Annual' })
        .click();

      await expect(page).toHaveURL(/checkout\.stripe\.com/, {
        timeout: 30_000,
      });
      const cardPaymentMethod = page.getByRole('radio', {
        name: 'Card',
        exact: true,
      });
      const cardNumber = page.getByLabel(/card number/i);
      await expect
        .poll(
          async () =>
            (await cardPaymentMethod.isVisible()) ||
            (await cardNumber.isVisible()),
          { timeout: 30_000 },
        )
        .toBe(true);
      if (await cardPaymentMethod.isVisible()) {
        // Older Checkout markup requires expanding Card; its cover intercepts clicks.
        await cardPaymentMethod.check({ force: true });
        await expect(cardPaymentMethod).toBeChecked();
      }
      const saveInformation = page.getByRole('checkbox', {
        name: 'Save my information for faster checkout',
      });
      if (
        (await saveInformation.isVisible()) &&
        (await saveInformation.isChecked())
      ) {
        await saveInformation.uncheck();
      }
      await cardNumber.fill('4242424242424242');
      await page.getByLabel(/expiration/i).fill('12/30');
      await page.getByRole('textbox', { name: 'CVC', exact: true }).fill('123');

      const cardholderName = page.getByLabel(/cardholder name|name on card/i);
      if (await cardholderName.isVisible()) {
        await cardholderName.fill('E2E Test User');
      }

      const postalCode = page.getByLabel(/zip|postal code/i);
      if (await postalCode.isVisible()) {
        await postalCode.fill('10001');
      }

      const termsCheckbox = page.getByRole('checkbox', {
        name: /I agree to .*Terms of Service and Privacy Policy/i,
      });
      await termsCheckbox.check();
      await expect(termsCheckbox).toBeChecked();
      await page
        .getByRole('button', { name: 'Subscribe', exact: true })
        .click();

      await expect(
        page.getByRole('heading', {
          name: 'You’re all set — your subscription is active',
        }),
      ).toBeVisible({ timeout: 30_000 });

      await expectE2EUserHasPaidAnnualSubscription();

      await expect(page).toHaveURL(/\/app\/dashboard$/, { timeout: 15_000 });
      await page.goto('/app/practice');
      await expect(
        page.getByRole('heading', { name: 'Practice' }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/app\/practice$/);
    });
  });
