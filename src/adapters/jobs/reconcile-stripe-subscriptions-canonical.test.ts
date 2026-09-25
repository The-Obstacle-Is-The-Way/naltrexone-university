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
  otherUserId,
  primaryUserId,
  row,
} from './test-helpers/reconcile-stripe-subscriptions-harness';

describe('reconcileStripeSubscriptions canonical selection', () => {
  it('does not attempt canonical selection when Stripe returns no blocking subscriptions', async () => {
    const scenario = createSingleRowScenario({
      stripe: createStripeWithSubscriptions([
        createUserSubscriptionFixture('sub_canceled', { status: 'canceled' }),
      ]),
      subscriptionId: 'sub_canceled',
    });
    await expectDryRunSuccess(scenario);

    await expect(
      scenario.subscriptions.findByUserId(primaryUserId),
    ).resolves.toMatchObject({
      status: 'canceled',
    });
  });

  it('reports a failure when a blocking subscription belongs to a different user', async () => {
    const scenario = createSingleRowScenario({
      stripe: createStripeWithSubscriptions([
        createUserSubscriptionFixture('sub_local', { customerId: 'cus_1' }),
        createUserSubscriptionFixture('sub_blocking', {
          userId: otherUserId,
          customerId: 'cus_1',
        }),
      ]),
      subscriptionId: 'sub_local',
    });

    const result = await scenario.run({ dryRun: true });

    expectSingleFailure(result, {
      stripeSubscriptionId: 'sub_local',
      error: 'Blocking Stripe subscription user id mismatch',
    });

    await expect(
      scenario.subscriptions.findByUserId(primaryUserId),
    ).resolves.toBeNull();
    await expect(
      scenario.stripeCustomers.findByUserId(primaryUserId),
    ).resolves.toBeNull();
  });

  // Stripe cannot answer a retrieval with another Subscription's id; the
  // retrieve override forces that impossible response to reach the job's
  // defensive checks.
  it.each([
    {
      name: 'reports a failure when the canonical Stripe subscription cannot be determined',
      retrievedId: '',
      expectedError: 'Unable to determine canonical Stripe subscription',
    },
    {
      name: 'reports a failure when canonical Stripe subscription data is missing',
      retrievedId: 'sub_other',
      expectedError: 'Canonical Stripe subscription data is missing',
    },
  ])('$name', async ({ retrievedId, expectedError }) => {
    const stripe = createStripeWithSubscriptions([
      createUserSubscriptionFixture('sub_local', { status: 'canceled' }),
      createUserSubscriptionFixture('sub_blocking'),
    ]);
    stripe.setSubscriptionRetrieveOverride((subscription) =>
      subscription.id === 'sub_blocking'
        ? { ...subscription, id: retrievedId }
        : subscription,
    );

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: 'sub_local',
    });

    const result = await scenario.run({ dryRun: true });

    expectSingleFailure(result, {
      stripeSubscriptionId: 'sub_local',
      error: expectedError,
    });
  });

  it.each([
    { stripeStatus: 'unpaid' as const, duplicateId: 'sub_unpaid' },
    { stripeStatus: 'incomplete' as const, duplicateId: 'sub_incomplete' },
    { stripeStatus: 'paused' as const, duplicateId: 'sub_paused' },
  ])(
    'keeps an active subscription over a later $stripeStatus duplicate',
    async ({ stripeStatus, duplicateId }) => {
      const stripe = createStripeWithSubscriptions([
        createUserSubscriptionFixture('sub_active', {
          currentPeriodEnd: 1_800_000_000,
        }),
        createUserSubscriptionFixture(duplicateId, {
          status: stripeStatus,
          currentPeriodEnd: 1_900_000_000,
        }),
      ]);

      const scenario = createSingleRowScenario({
        stripe,
        subscriptionId: 'sub_active',
      });

      const result = await scenario.run({ dryRun: false });

      expect(result).toEqual({
        scanned: 1,
        updated: 1,
        failed: 0,
        failures: [],
      });
      expect(stripe.subscriptions.cancelCalls).toEqual([
        duplicateCancel(duplicateId),
      ]);
      await expect(
        stripe.subscriptions.retrieve(duplicateId),
      ).resolves.toMatchObject({ status: 'canceled' });
      await expect(
        scenario.subscriptions.findByExternalSubscriptionId('sub_active'),
      ).resolves.toMatchObject({
        userId: primaryUserId,
        status: 'active',
        currentPeriodEnd: new Date(1_800_000_000 * 1000),
      });
      await expect(
        scenario.subscriptions.findByExternalSubscriptionId(duplicateId),
      ).resolves.toBeNull();
    },
  );

  it('keeps the local row active over a later unpaid duplicate in dry-run mode', async () => {
    const stripe = createStripeWithSubscriptions([
      createUserSubscriptionFixture('sub_active', {
        currentPeriodEnd: 1_800_000_000,
      }),
      createUserSubscriptionFixture('sub_unpaid', {
        status: 'unpaid',
        currentPeriodEnd: 1_900_000_000,
      }),
    ]);

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: 'sub_active',
    });

    const result = await scenario.run({ dryRun: true });

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });
    expect(stripe.subscriptions.cancelCalls).toEqual([]);
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_active'),
    ).resolves.toMatchObject({
      userId: primaryUserId,
      status: 'active',
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
    });
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_unpaid'),
    ).resolves.toBeNull();
  });

  it('replaces a stale non-blocking local subscription with the blocking Stripe subscription', async () => {
    const stripe = createStripeWithSubscriptions([
      createUserSubscriptionFixture('sub_local_canceled', {
        status: 'canceled',
        currentPeriodEnd: 1_700_000_000,
      }),
      createUserSubscriptionFixture('sub_active', {
        currentPeriodEnd: 1_700_001_000,
      }),
      createUserSubscriptionFixture('sub_trialing', {
        status: 'trialing',
        currentPeriodEnd: 1_700_000_500,
      }),
    ]);

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: 'sub_local_canceled',
    });
    await expectDryRunSuccess(scenario);

    await expect(
      scenario.subscriptions.findByUserId(primaryUserId),
    ).resolves.toMatchObject({
      status: 'active',
    });
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_active'),
    ).resolves.toMatchObject({
      userId: primaryUserId,
      status: 'active',
    });
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_trialing'),
    ).resolves.toBeNull();
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_local_canceled'),
    ).resolves.toBeNull();
    expect(stripe.subscriptions.cancelCalls).toEqual([]);
  });

  it('still selects the latest period end when only non-entitled candidates exist', async () => {
    const stripe = createStripeWithSubscriptions([
      createUserSubscriptionFixture('sub_unpaid_old', {
        status: 'unpaid',
        currentPeriodEnd: 1_700_000_000,
      }),
      createUserSubscriptionFixture('sub_paused_later', {
        status: 'paused',
        currentPeriodEnd: 1_800_000_000,
      }),
    ]);

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: 'sub_unpaid_old',
    });

    const result = await scenario.run({ dryRun: false });

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });
    expect(stripe.subscriptions.cancelCalls).toEqual([
      duplicateCancel('sub_unpaid_old'),
    ]);
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_paused_later'),
    ).resolves.toMatchObject({
      userId: primaryUserId,
      status: 'paused',
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
    });
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_unpaid_old'),
    ).resolves.toBeNull();
  });

  it('keeps persisting a different canonical winner over a current entitled row', async () => {
    const now = new Date('2026-06-12T00:00:00.000Z');
    const localPeriodEnd = Math.floor(
      (now.getTime() + 24 * 60 * 60 * 1000) / 1000,
    );
    const canonicalPeriodEnd = Math.floor(
      (now.getTime() + 2 * 24 * 60 * 60 * 1000) / 1000,
    );
    const stripe = createStripeWithSubscriptions([
      createUserSubscriptionFixture('sub_local', {
        currentPeriodEnd: localPeriodEnd,
      }),
      createUserSubscriptionFixture('sub_canonical', {
        status: 'past_due',
        currentPeriodEnd: canonicalPeriodEnd,
      }),
    ]);
    const subscriptions = new FakeSubscriptionRepository([], () => now);
    await subscriptions.upsert({
      userId: primaryUserId,
      externalSubscriptionId: 'sub_local',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date(localPeriodEnd * 1000),
      cancelAtPeriodEnd: false,
      expectedVersion: null,
    });

    const scenario = createReconciliationTestScenario({
      stripe,
      subscriptions,
      localSubscriptions: [row(primaryUserId, 'sub_local')],
    });

    const result = await scenario.run({ dryRun: true });

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_canonical'),
    ).resolves.toMatchObject({
      userId: primaryUserId,
      status: 'pastDue',
      currentPeriodEnd: new Date(canonicalPeriodEnd * 1000),
    });
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_local'),
    ).resolves.toBeNull();
  });

  it('selects canonical by highest currentPeriodEnd even when local row is blocking', async () => {
    const stripe = createStripeWithSubscriptions([
      createUserSubscriptionFixture('sub_local', {
        currentPeriodEnd: 1_700_000_000,
      }),
      createUserSubscriptionFixture('sub_better', {
        currentPeriodEnd: 1_800_000_000,
      }),
    ]);

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: 'sub_local',
    });

    const result = await scenario.run({ dryRun: false });

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });
    expect(stripe.subscriptions.cancelCalls).toEqual([
      duplicateCancel('sub_local'),
    ]);
    await expect(
      scenario.subscriptions.findByUserId(primaryUserId),
    ).resolves.toMatchObject({
      status: 'active',
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
    });
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

  it('breaks ties by lexicographically smallest subscription id', async () => {
    const stripe = createStripeWithSubscriptions([
      createUserSubscriptionFixture('sub_z', {
        currentPeriodEnd: 1_800_000_000,
      }),
      createUserSubscriptionFixture('sub_a', {
        currentPeriodEnd: 1_800_000_000,
      }),
    ]);

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: 'sub_z',
    });

    const result = await scenario.run({ dryRun: false });

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });
    expect(stripe.subscriptions.cancelCalls).toEqual([
      duplicateCancel('sub_z'),
    ]);
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_a'),
    ).resolves.toMatchObject({
      userId: primaryUserId,
      status: 'active',
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
    });
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_z'),
    ).resolves.toBeNull();
  });

  it('breaks ties deterministically when multiple blocking subscriptions share the same currentPeriodEnd', async () => {
    // Seeded, and so listed, b before a: the choice must not follow order.
    const scenario = createSingleRowScenario({
      stripe: createStripeWithSubscriptions([
        createUserSubscriptionFixture('sub_local_canceled', {
          status: 'canceled',
          currentPeriodEnd: 1_700_000_000,
        }),
        createUserSubscriptionFixture('sub_b', {
          currentPeriodEnd: 1_700_001_000,
        }),
        createUserSubscriptionFixture('sub_a', {
          currentPeriodEnd: 1_700_001_000,
        }),
      ]),
      subscriptionId: 'sub_local_canceled',
    });
    await expectDryRunSuccess(scenario);

    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_a'),
    ).resolves.toMatchObject({
      userId: primaryUserId,
      status: 'active',
    });
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId('sub_b'),
    ).resolves.toBeNull();
  });
});
