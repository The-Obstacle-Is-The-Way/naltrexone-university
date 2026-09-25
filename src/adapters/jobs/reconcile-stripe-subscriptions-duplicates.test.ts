import { describe, expect, it } from 'vitest';
import { FakeSubscriptionRepository } from '@/src/application/test-helpers/fakes';
import {
  createReconciliationTestScenario,
  createSingleRowScenario,
  createStripeWithSubscriptions,
  createUserSubscriptionFixture,
  duplicateCancel,
  expectDryRunSuccess,
  expectSingleFailure,
  primaryUserId,
  row,
} from './test-helpers/reconcile-stripe-subscriptions-harness';

// The local row points at sub_keep; sub_dup_2 has the latest period end and
// is kept, so sub_keep and sub_dup_1 are the duplicates canceled in order.
// The customer also has an old canceled Subscription, which Stripe lists
// under `status: 'all'` and which must never count as a duplicate.
function createDuplicatesStripe() {
  return createStripeWithSubscriptions([
    createUserSubscriptionFixture('sub_old_canceled', {
      status: 'canceled',
      currentPeriodEnd: 1_600_000_000,
    }),
    createUserSubscriptionFixture('sub_keep', {
      currentPeriodEnd: 1_700_000_000,
    }),
    createUserSubscriptionFixture('sub_dup_1', {
      status: 'trialing',
      currentPeriodEnd: 1_700_000_100,
    }),
    createUserSubscriptionFixture('sub_dup_2', {
      status: 'past_due',
      currentPeriodEnd: 1_700_000_200,
    }),
  ]);
}

type Transaction = NonNullable<
  Parameters<typeof createReconciliationTestScenario>[0]['transaction']
>;

// A local row whose Subscription loses to a later one; the local one is the
// single duplicate.
async function createLocalAndBetterScenario(
  stripe: ReturnType<typeof createStripeWithSubscriptions>,
  transaction?: Transaction,
) {
  const subscriptions = new FakeSubscriptionRepository();
  await subscriptions.upsert({
    userId: primaryUserId,
    externalSubscriptionId: 'sub_local',
    plan: 'monthly',
    status: 'active',
    currentPeriodEnd: new Date(1_700_000_000 * 1000),
    cancelAtPeriodEnd: false,
    expectedVersion: null,
  });
  return createReconciliationTestScenario({
    stripe,
    subscriptions,
    localSubscriptions: [row(primaryUserId, 'sub_local')],
    ...(transaction ? { transaction } : {}),
  });
}

function createLocalAndBetterStripe() {
  return createStripeWithSubscriptions([
    createUserSubscriptionFixture('sub_local', {
      currentPeriodEnd: 1_700_000_000,
    }),
    createUserSubscriptionFixture('sub_better', {
      currentPeriodEnd: 1_800_000_000,
    }),
  ]);
}

describe('reconcileStripeSubscriptions duplicate cancellation', () => {
  it('cancels duplicate blocking subscriptions when dryRun is disabled', async () => {
    const stripe = createDuplicatesStripe();
    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: 'sub_keep',
    });

    const result = await scenario.run({ dryRun: false });

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });
    expect(stripe.subscriptions.cancelCalls).toEqual([
      duplicateCancel('sub_keep'),
      duplicateCancel('sub_dup_1'),
    ]);
    await expect(
      stripe.subscriptions.list({ customer: 'cus_123', status: 'all' }),
    ).resolves.toEqual({
      data: [
        expect.objectContaining({ id: 'sub_old_canceled', status: 'canceled' }),
        expect.objectContaining({ id: 'sub_keep', status: 'canceled' }),
        expect.objectContaining({ id: 'sub_dup_1', status: 'canceled' }),
        expect.objectContaining({ id: 'sub_dup_2', status: 'past_due' }),
      ],
    });
    await expect(
      scenario.subscriptions.findByUserId(primaryUserId),
    ).resolves.toMatchObject({
      status: 'pastDue',
      currentPeriodEnd: new Date(1_700_000_200 * 1000),
    });
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_dup_2'),
    ).resolves.toMatchObject({
      userId: primaryUserId,
      status: 'pastDue',
      currentPeriodEnd: new Date(1_700_000_200 * 1000),
    });
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_keep'),
    ).resolves.toBeNull();
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_dup_1'),
    ).resolves.toBeNull();
  });

  it('continues canceling remaining duplicates when Stripe reports one duplicate is already canceled', async () => {
    const stripe = createDuplicatesStripe();
    // sub_keep is canceled elsewhere between the listing and its cancel, so
    // the fake answers that cancel with Stripe's 404.
    stripe.setSubscriptionCancelHook((subscriptionId) => {
      if (subscriptionId === 'sub_keep') {
        stripe.markSubscriptionCanceled('sub_keep');
      }
    });
    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: 'sub_keep',
    });

    const result = await scenario.run({ dryRun: false });

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });
    expect(stripe.subscriptions.cancelCalls).toEqual([
      duplicateCancel('sub_keep'),
      duplicateCancel('sub_dup_1'),
    ]);
    expect(scenario.logger.infoCalls).toEqual([
      {
        context: { stripeSubscriptionId: 'sub_keep' },
        msg: 'Duplicate subscription already canceled externally',
      },
    ]);
  });

  it('excludes already-canceled duplicates from the cancellation summary log', async () => {
    const stripe = createDuplicatesStripe();
    stripe.setSubscriptionCancelHook((subscriptionId) => {
      if (subscriptionId === 'sub_keep') {
        stripe.markSubscriptionCanceled('sub_keep');
      }
    });
    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: 'sub_keep',
    });

    await scenario.run({ dryRun: false });

    expect(scenario.logger.warnCalls).toEqual([
      {
        context: {
          userId: primaryUserId,
          stripeCustomerId: 'cus_123',
          keptSubscriptionId: 'sub_dup_2',
          duplicateSubscriptionIds: ['sub_keep', 'sub_dup_1'],
          canceledDuplicateSubscriptionIds: ['sub_dup_1'],
          alreadyCanceledSubscriptionIds: ['sub_keep'],
          dryRun: false,
        },
        msg: 'Canceled duplicate Stripe subscriptions',
      },
    ]);
  });

  it('reports when all duplicates were already canceled externally', async () => {
    const stripe = createDuplicatesStripe();
    stripe.setSubscriptionCancelHook((subscriptionId) => {
      stripe.markSubscriptionCanceled(subscriptionId);
    });
    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: 'sub_keep',
    });

    const result = await scenario.run({ dryRun: false });

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });
    expect(scenario.logger.warnCalls).toEqual([
      {
        context: {
          userId: primaryUserId,
          stripeCustomerId: 'cus_123',
          keptSubscriptionId: 'sub_dup_2',
          duplicateSubscriptionIds: ['sub_keep', 'sub_dup_1'],
          canceledDuplicateSubscriptionIds: [],
          alreadyCanceledSubscriptionIds: ['sub_keep', 'sub_dup_1'],
          dryRun: false,
        },
        msg: 'Duplicate Stripe subscriptions already canceled externally',
      },
    ]);
  });

  it('does not cancel duplicate blocking subscriptions in dry-run mode', async () => {
    const stripe = createStripeWithSubscriptions([
      createUserSubscriptionFixture('sub_keep'),
      createUserSubscriptionFixture('sub_dup', { status: 'trialing' }),
    ]);
    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: 'sub_keep',
    });
    await expectDryRunSuccess(scenario);

    expect(stripe.subscriptions.cancelCalls).toEqual([]);
  });

  it('fails the row when Stripe cancel returns an unexpected authentication error', async () => {
    const stripe = createLocalAndBetterStripe();
    stripe.setSubscriptionCancelHook(() => {
      throw Object.assign(new Error('Invalid API Key provided'), {
        rawType: 'authentication_error',
      });
    });
    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: 'sub_local',
    });

    const result = await scenario.run({ dryRun: false });

    expectSingleFailure(result, {
      stripeSubscriptionId: 'sub_local',
      error: 'Invalid API Key provided',
    });
    expect(scenario.logger.infoCalls).toEqual([]);
  });

  it('persists the canonical subscription before attempting duplicate cancellation', async () => {
    const stripe = createLocalAndBetterStripe();
    stripe.setSubscriptionCancelHook(() => {
      throw new Error('cancel failed');
    });
    const scenario = await createLocalAndBetterScenario(stripe);

    const result = await scenario.run({ dryRun: false });

    expectSingleFailure(result, {
      stripeSubscriptionId: 'sub_local',
      error: 'cancel failed',
    });
    expect(stripe.subscriptions.cancelCalls).toEqual([
      duplicateCancel('sub_local'),
    ]);
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_better'),
    ).resolves.toMatchObject({
      userId: primaryUserId,
      status: 'active',
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
    });
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_local'),
    ).resolves.toBeNull();
  });

  it('does not cancel duplicates when persisting the canonical subscription fails', async () => {
    const stripe = createLocalAndBetterStripe();
    const scenario = await createLocalAndBetterScenario(stripe, async () => {
      throw new Error('db failed');
    });

    const result = await scenario.run({ dryRun: false });

    expectSingleFailure(result, {
      stripeSubscriptionId: 'sub_local',
      error: 'db failed',
    });
    expect(stripe.subscriptions.cancelCalls).toEqual([]);
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_local'),
    ).resolves.toMatchObject({
      userId: primaryUserId,
      status: 'active',
      currentPeriodEnd: new Date(1_700_000_000 * 1000),
    });
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_better'),
    ).resolves.toBeNull();
  });
});
