import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { createStripeTestClient } from './helpers/stripe-test-client';
import {
  type E2EEntitlementSnapshot,
  ensureSubscribed,
  removeE2EUserEntitlement,
  restoreE2EUserEntitlement,
} from './helpers/subscription';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

const TRIAL_DAYS_LEFT_MS = 7 * 24 * 60 * 60 * 1000;
const CHECKOUT_SESSION_ID_PATTERN = /\/(cs_test_[A-Za-z0-9]+)/;

// DEBT-468: the trial banner's add-card button starts a setup-mode Checkout
// Session (createTrialPaymentMethodSetupSession). The shared user's own row is
// switched to a trial for this case only; the Session is expired and the row
// restored afterwards, so nothing accumulates on the shared Stripe customer.
test.describe('trial add-card', () => {
  // Clerk sign-in plus a real Checkout Session creation can exceed the default budget.
  test.setTimeout(120_000);

  let entitlementSnapshot: E2EEntitlementSnapshot | null = null;
  let setupSessionId: string | null = null;

  test.beforeEach(async () => {
    entitlementSnapshot = null;
    setupSessionId = null;
    await runE2EUserStateReset();
  });

  // The shared user's row matters to every later test; an open Session only
  // lapses on its own. Restore first, and expire the Session even if that fails.
  test.afterEach(async () => {
    const snapshot = entitlementSnapshot;
    const sessionId = setupSessionId;
    entitlementSnapshot = null;
    setupSessionId = null;
    try {
      if (snapshot) await restoreE2EUserEntitlement(snapshot);
    } finally {
      if (sessionId) {
        await createStripeTestClient().checkout.sessions.expire(sessionId);
      }
    }
  });

  test('a trialing user reaches Stripe Checkout to add a card', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    const snapshot = await removeE2EUserEntitlement();
    entitlementSnapshot = snapshot;
    // A fresh Subscription id keys a fresh Checkout idempotency key, so runs
    // never replay each other's Sessions on the shared customer.
    await restoreE2EUserEntitlement({
      ...snapshot,
      stripeSubscriptionId: `sub_e2e_add_card_${randomUUID().replaceAll('-', '')}`,
      status: 'trialing',
      currentPeriodEnd: new Date(Date.now() + TRIAL_DAYS_LEFT_MS),
    });

    await page.goto('/app/dashboard');
    await page
      .getByRole('button', { name: 'Add a card to keep access' })
      .click();

    // Stripe owns everything after this origin boundary. Required CI stops here.
    await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//, {
      timeout: 30_000,
    });
    const [, sessionId] = page.url().match(CHECKOUT_SESSION_ID_PATTERN) ?? [];
    expect(sessionId, 'Checkout URL carries a test-mode Session id').toMatch(
      /^cs_test_/,
    );
    setupSessionId = sessionId ?? null;

    const session = await createStripeTestClient().checkout.sessions.retrieve(
      String(sessionId),
    );
    expect(session).toMatchObject({ mode: 'setup', status: 'open' });
  });
});
