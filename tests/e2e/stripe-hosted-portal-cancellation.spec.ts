import { expect, type Page, test } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import {
  readE2ELocalSubscription,
  readE2EStripeSubscription,
} from './helpers/portal-cancellation';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import {
  findLatestStripeEvent,
  replayStripeEventToLocalApp,
} from './helpers/stripe-event-replay';
import { completeNoCardTrialCheckout } from './helpers/stripe-hosted-checkout';
import {
  resetE2EUserToFirstTimer,
  restoreE2EUserPaidSubscription,
} from './helpers/subscription';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

// DEBT-414 F04: observational evidence that a learner can cancel in the
// Billing portal without obstruction, that renewal stops, and that access
// continues to the end of the period. Stripe owns the portal's DOM, so this
// file belongs only to the scheduled/manual stripe-hosted project.

async function openPortal(page: Page): Promise<void> {
  await page.goto('/app/billing');
  await page.getByRole('button', { name: 'Manage in Stripe' }).click();
  await expect(page).toHaveURL(/^https:\/\/billing\.stripe\.com\//, {
    timeout: 30_000,
  });
}

// The cancellation flow as a learner meets it: the cancel link, an optional
// reason that is skipped, and one confirmation.
async function cancelInPortal(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Cancel subscription' }).click();
  const reason = page.getByRole('alertdialog', {
    name: 'Cancel your subscription',
  });
  await expect(reason).toBeVisible();
  await reason
    .getByRole('button', { name: 'Continue to cancellation' })
    .click();
  await page.getByRole('button', { name: 'Cancel subscription' }).click();
  // Stripe words the confirmation differently for a trial and a paid period;
  // both offer to undo it.
  // Stripe reloads the portal after confirming, which can take a while.
  await expect(
    page.getByRole('link', { name: "Don't cancel subscription" }),
  ).toBeVisible({ timeout: 15_000 });
}

async function syncCancellationToApp(
  page: Page,
  subscriptionId: string,
  createdSince: number,
): Promise<void> {
  const event = await findLatestStripeEvent({
    type: 'customer.subscription.updated',
    objectId: subscriptionId,
    createdSince,
  });
  await page.goto('/app/billing');
  await replayStripeEventToLocalApp(page, event);
}

async function expectStoredCancellation(scheduled: boolean): Promise<void> {
  await expect
    .poll(async () => (await readE2ELocalSubscription()).cancelAtPeriodEnd, {
      timeout: 15_000,
    })
    .toBe(scheduled);
}

test.describe
  .serial('Billing-portal cancellation', () => {
    test.setTimeout(150_000);

    // Hosted Checkout's trial subscription carries no owner tag, so only a
    // full first-timer reset clears it. Every case starts and ends there, then
    // restores the shared paid subscription, as the trial-start lane does.
    test.beforeEach(async () => {
      await runE2EUserStateReset();
      await resetE2EUserToFirstTimer();
    });

    test.afterEach(async () => {
      await resetE2EUserToFirstTimer();
      await restoreE2EUserPaidSubscription();
    });

    test('a paid subscriber cancels without obstruction; renewal stops and access continues to the period end', async ({
      page,
    }) => {
      await restoreE2EUserPaidSubscription();
      await signInWithClerkPassword(page);
      const before = await readE2ELocalSubscription();
      const stripeBefore = await readE2EStripeSubscription(before.id);
      expect(stripeBefore).toMatchObject({
        status: 'active',
        cancelAt: null,
        cancelAtPeriodEnd: false,
      });
      const startedAt = Math.floor(Date.now() / 1000) - 1;

      await openPortal(page);
      // DEBT-414 F05: a paying subscriber may still update the card.
      await expect(
        page.getByRole('link', { name: 'Add payment method' }),
      ).toBeVisible();
      await cancelInPortal(page);

      // Stripe: renewal stops at the end of the current period, which is
      // unchanged, and the subscription stays active until then.
      await expect
        .poll(async () => (await readE2EStripeSubscription(before.id)).cancelAt)
        .toBe(stripeBefore.currentPeriodEnd);
      expect(await readE2EStripeSubscription(before.id)).toMatchObject({
        status: 'active',
        currentPeriodEnd: stripeBefore.currentPeriodEnd,
      });

      // The app: Stripe's real event, replayed through the signed webhook,
      // records the cancellation, and the learner keeps access.
      await syncCancellationToApp(page, before.id, startedAt);
      await expectStoredCancellation(true);
      expect(await readE2ELocalSubscription()).toMatchObject({
        status: 'active',
        currentPeriodEnd: before.currentPeriodEnd,
      });
      await page.goto('/app/billing');
      await expect(page.getByText('Cancellation scheduled')).toBeVisible();
      await expect(
        page.getByText("You'll keep access until then.", { exact: false }),
      ).toBeVisible();
      await page.goto('/app/dashboard');
      await expect(page).toHaveURL(/\/app\/dashboard/);
    });

    test('a trial learner meets no payment-method update in the portal, and cancelling keeps access to the trial end', async ({
      page,
    }) => {
      await signInWithClerkPassword(page);
      await page.goto('/pricing');
      await page
        .getByRole('button', { name: 'Start 7-day free trial' })
        .first()
        .click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Start free trial', exact: true })
        .click();
      await completeNoCardTrialCheckout(page);
      await expect(page).toHaveURL(/\/app\//, { timeout: 30_000 });

      const trial = await readE2ELocalSubscription();
      const stripeTrial = await readE2EStripeSubscription(trial.id);
      expect(stripeTrial).toMatchObject({ status: 'trialing', cancelAt: null });
      const startedAt = Math.floor(Date.now() / 1000) - 1;

      await openPortal(page);
      // DEBT-414 F05: a trial's first card comes only through the add-card
      // flow that records consent, never the portal.
      await expect(
        page.getByRole('link', { name: 'Cancel subscription' }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Add payment method' }),
      ).toHaveCount(0);
      await cancelInPortal(page);

      await expect
        .poll(async () => (await readE2EStripeSubscription(trial.id)).cancelAt)
        .toBe(stripeTrial.currentPeriodEnd);
      await syncCancellationToApp(page, trial.id, startedAt);
      await expectStoredCancellation(true);
      expect(await readE2ELocalSubscription()).toMatchObject({
        status: 'trialing',
        currentPeriodEnd: trial.currentPeriodEnd,
      });
      await page.goto('/app/billing');
      await expect(page.getByText('Cancellation scheduled')).toBeVisible();
    });
  });
