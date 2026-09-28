import { expect, test } from '@playwright/test';
import {
  expectE2ETrialPaymentConsent,
  readDisplayedPlanConsent,
} from './helpers/checkout-consent';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import {
  completeHostedCardSetup,
  completeNoCardTrialCheckout,
} from './helpers/stripe-hosted-checkout';
import { createStripeTestClient } from './helpers/stripe-test-client';
import {
  resetE2EUserToFirstTimer,
  restoreE2EUserPaidSubscription,
} from './helpers/subscription';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

// Observational compatibility coverage for Stripe-owned, unsupported DOM.
// This file belongs only to the scheduled/manual stripe-hosted project.
const SETUP_SESSION_ID_PATTERN = /\/(cs_test_[A-Za-z0-9]+)/;

// DEBT-414 F03b: a trialing learner adds a card through the add-card consent
// dialog, and the consent recorded is exactly the text that dialog showed.
test.describe('trial add-card', () => {
  // Two hosted Checkout visits plus Clerk sign-in span three origins.
  test.setTimeout(180_000);

  // The first-timer reset cancels this run's trial and detaches its card, so
  // no card stays on the shared customer for the no-card trial journey.
  test.beforeEach(async () => {
    await runE2EUserStateReset();
    await resetE2EUserToFirstTimer();
  });

  let setupSessionId: string | null = null;

  test.afterEach(async () => {
    const sessionId = setupSessionId;
    setupSessionId = null;
    try {
      await resetE2EUserToFirstTimer();
    } finally {
      try {
        await restoreE2EUserPaidSubscription();
      } finally {
        // A failed run must not leave its setup Session open for a day.
        if (sessionId) {
          const stripe = createStripeTestClient();
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          if (session.status === 'open') {
            await stripe.checkout.sessions.expire(sessionId);
          }
        }
      }
    }
  });

  test('a trialing learner opts in, saves a card, the recorded consent is the text shown, and the app confirms the card', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await page.goto('/pricing');
    await page
      .getByRole('button', { name: 'Start 7-day free trial' })
      .first()
      .click();
    const trialDialog = page.getByRole('dialog');
    await trialDialog.getByRole('checkbox').check();
    await trialDialog
      .getByRole('button', { name: 'Start free trial', exact: true })
      .click();
    await completeNoCardTrialCheckout(page);
    await expect(page).toHaveURL(/\/app\//, { timeout: 30_000 });

    await page
      .getByRole('button', { name: 'Add a card to keep access' })
      .click();
    const displayedConsent = await readDisplayedPlanConsent(page);
    const addCardDialog = page.getByRole('dialog');
    await expect(addCardDialog.getByRole('checkbox')).not.toBeChecked();
    await addCardDialog.getByRole('checkbox').check();
    await addCardDialog
      .getByRole('button', { name: 'Add a card', exact: true })
      .click();

    await expect(page).toHaveURL(/checkout\.stripe\.com/, {
      timeout: 30_000,
    });
    const [, sessionId] = page.url().match(SETUP_SESSION_ID_PATTERN) ?? [];
    setupSessionId = sessionId ?? null;
    expect(sessionId, 'Checkout URL carries a test-mode Session id').toMatch(
      /^cs_test_/,
    );
    const learnerEmail = String(process.env.E2E_CLERK_USER_USERNAME);
    const { emailTyped, emailShown } = await completeHostedCardSetup(
      page,
      learnerEmail,
    );
    // BUG-308: the Session carries the learner's email, Stripe visibly shows
    // it, and the learner never retypes it (#1185 and #1186 reviews).
    const setupSession =
      await createStripeTestClient().checkout.sessions.retrieve(
        String(sessionId),
      );
    expect(setupSession.customer_email).toBe(learnerEmail);
    expect(emailShown).toBe(learnerEmail);
    expect(emailTyped).toBe(false);
    await expect(page).toHaveURL(
      /\/app\/billing\?(?:.*&)?trial_payment_method=success(?:&|$)/,
      {
        timeout: 30_000,
      },
    );
    // BUG-308: until Stripe's event arrives, Billing says so.
    await expect(
      page.getByText(
        'Stripe is confirming your card. Refresh this page in a moment.',
      ),
    ).toBeVisible();

    await expectE2ETrialPaymentConsent(page, {
      plan: 'monthly',
      setupSessionId: String(sessionId),
      ...displayedConsent,
    });

    // BUG-308: once the card is saved, Billing confirms it, and the banner
    // states the renewal instead of asking for a card.
    await page.reload();
    await expect(page.getByText('Your card is saved.')).toBeVisible();
    await expect(
      page.getByText(
        'Renews at $29 per month on your saved card when your trial ends, until you cancel.',
      ),
    ).toBeVisible();
    await page.goto('/app/dashboard');
    await expect(
      page.getByText(
        'Pro Monthly renews at $29 per month on your saved card when your trial ends.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add a card to keep access' }),
    ).toHaveCount(0);
  });
});
