import { describe, expect, it, vi } from 'vitest';
import { FakeStripeCheckoutClient } from '@/src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeRenewalConsentRecordRepository,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { newRenewalConsentRecord } from '@/src/domain/entities';
import {
  createReconciliationTestScenario,
  createSingleRowScenario,
  createStripeWithSubscriptions,
  createUserSubscriptionFixture,
  expectDryRunSuccess,
  expectSingleFailure,
  otherUserId,
  primaryUserId,
  row,
  secondaryUserId,
  tertiaryUserId,
} from './test-helpers/reconcile-stripe-subscriptions-harness';

describe('reconcileStripeSubscriptions batch processing and persistence', () => {
  it('processes rows with bounded concurrency (default 10)', async () => {
    async function flushUntil(condition: () => boolean) {
      for (let i = 0; i < 200; i += 1) {
        if (condition()) return;
        await Promise.resolve();
      }
      throw new Error('Timed out waiting for condition');
    }

    const rows = Array.from({ length: 12 }, (_, i) =>
      row(crypto.randomUUID(), `sub_${i + 1}`),
    );
    // Each row's Subscription has its own customer, so every listing sees
    // only that row's Subscription.
    const stripe = createStripeWithSubscriptions(
      rows.map(({ userId, stripeSubscriptionId }) =>
        createUserSubscriptionFixture(stripeSubscriptionId, {
          userId,
          customerId: `cus_${stripeSubscriptionId}`,
        }),
      ),
    );
    // Each retrieval is held open until the case releases it.
    let inFlight = 0;
    let maxInFlight = 0;
    const releases = new Map<string, () => void>();
    stripe.setSubscriptionRetrieveOverride(async (subscription) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => {
        releases.set(subscription.id, resolve);
      });
      inFlight -= 1;
      return subscription;
    });
    const release = (subscriptionIds: readonly string[]) => {
      for (const subscriptionId of subscriptionIds) {
        const resolve = releases.get(subscriptionId);
        if (!resolve) throw new Error(`Not held: ${subscriptionId}`);
        resolve();
      }
    };

    const scenario = createReconciliationTestScenario({
      stripe,
      localSubscriptions: rows,
    });
    const promise = scenario.run({ limit: 20 });

    await flushUntil(() => releases.size === 10);
    expect(stripe.subscriptions.retrieveCalls).toHaveLength(10);
    expect(maxInFlight).toBe(10);

    release(stripe.subscriptions.retrieveCalls.slice(0, 10));
    await flushUntil(() => releases.size === 12);
    release(stripe.subscriptions.retrieveCalls.slice(10));

    await expect(promise).resolves.toMatchObject({
      scanned: 12,
      updated: 12,
      failed: 0,
    });
  });

  it('continues processing remaining rows when one row fails under concurrency', async () => {
    const stripe = createStripeWithSubscriptions([
      createUserSubscriptionFixture('sub_1', { customerId: 'cus_1' }),
      createUserSubscriptionFixture('sub_2', {
        userId: otherUserId,
        customerId: 'cus_2',
      }),
      createUserSubscriptionFixture('sub_3', {
        userId: tertiaryUserId,
        customerId: 'cus_3',
      }),
    ]);

    const scenario = createReconciliationTestScenario({
      stripe,
      localSubscriptions: [
        row(primaryUserId, 'sub_1'),
        row(secondaryUserId, 'sub_2'),
        row(tertiaryUserId, 'sub_3'),
      ],
    });

    const result = await scenario.run({ concurrency: 3 });

    expect(result.scanned).toBe(3);
    expect(result.updated).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      stripeSubscriptionId: 'sub_2',
    });

    await expect(
      scenario.subscriptions.findByUserId(primaryUserId),
    ).resolves.not.toBeNull();
    await expect(
      scenario.subscriptions.findByUserId(tertiaryUserId),
    ).resolves.not.toBeNull();
    await expect(
      scenario.subscriptions.findByUserId(secondaryUserId),
    ).resolves.toBeNull();
    expect(scenario.logger.errorCalls.length).toBeGreaterThan(0);
  });

  it('throws STRIPE_ERROR when Stripe subscriptions API is unavailable for reconciliation', async () => {
    // The port's Subscriptions member is optional; a client without it is a
    // real configuration the job must refuse.
    const { subscriptions: _omitted, ...stripe } =
      new FakeStripeCheckoutClient();

    const scenario = createReconciliationTestScenario({ stripe });

    await expect(scenario.run()).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe subscriptions API is unavailable for reconciliation',
    });
  });

  it('keeps reconciliation fail-closed when Stripe subscription metadata.user_id is missing', async () => {
    const missingMetadataSubscription = createUserSubscriptionFixture(
      'sub_missing_metadata',
    );
    missingMetadataSubscription.metadata = {};
    const scenario = createSingleRowScenario({
      stripe: createStripeWithSubscriptions([missingMetadataSubscription]),
      subscriptionId: 'sub_missing_metadata',
    });

    const result = await scenario.run();

    expectSingleFailure(result, {
      stripeSubscriptionId: 'sub_missing_metadata',
      error: 'Stripe subscription metadata.user_id is required',
    });
    expect(scenario.logger.errorCalls).toContainEqual({
      context: expect.objectContaining({
        stripeSubscriptionId: 'sub_missing_metadata',
        error: {
          name: 'ApplicationError',
          code: 'STRIPE_ERROR',
        },
      }),
      msg: 'Stripe subscription reconciliation failed',
    });
    const projectedErrorLogs = scenario.logger.errorCalls.filter(
      ({ msg }) => msg === 'Stripe subscription reconciliation failed',
    );
    expect(JSON.stringify(projectedErrorLogs)).not.toContain(
      'Stripe subscription metadata.user_id is required',
    );
  });

  it('keeps reconciliation fail-closed when Stripe subscription e2e owner differs from configured owner', async () => {
    const scenario = createReconciliationTestScenario({
      stripe: createStripeWithSubscriptions([
        createUserSubscriptionFixture('sub_owner_mismatch', {
          e2eOwner: 'github-ci',
        }),
      ]),
      localSubscriptions: [row(primaryUserId, 'sub_owner_mismatch')],
      webhookE2EOwner: 'vercel-dev-preview',
    });

    const result = await scenario.run();

    expectSingleFailure(result, {
      stripeSubscriptionId: 'sub_owner_mismatch',
      error:
        'Stripe subscription metadata.e2e_owner does not match this webhook owner',
    });
    expect(scenario.logger.errorCalls).toContainEqual({
      context: expect.objectContaining({
        stripeSubscriptionId: 'sub_owner_mismatch',
        error: {
          name: 'ApplicationError',
          code: 'STRIPE_ERROR',
        },
      }),
      msg: 'Stripe subscription reconciliation failed',
    });
    const projectedErrorLogs = scenario.logger.errorCalls.filter(
      ({ msg }) => msg === 'Stripe subscription reconciliation failed',
    );
    expect(JSON.stringify(projectedErrorLogs)).not.toContain(
      'Stripe subscription metadata.e2e_owner does not match this webhook owner',
    );
  });

  it('fails loudly when the local subscription list contains holes (internal invariant)', async () => {
    const sparseRows = new Array<ReturnType<typeof row>>(1);
    const scenario = createReconciliationTestScenario({
      stripe: new FakeStripeCheckoutClient(),
      listLocalSubscriptions: async () => sparseRows,
    });

    await expect(scenario.run({ concurrency: 1 })).rejects.toThrow(
      'mapWithConcurrencyLimit: missing item at index 0',
    );
  });

  it('defaults invalid numeric inputs using safe fallbacks', async () => {
    const listLocalSubscriptions = vi.fn(async () => []);
    const scenario = createReconciliationTestScenario({
      stripe: new FakeStripeCheckoutClient(),
      listLocalSubscriptions,
    });

    const result = await scenario.run({
      limit: Number.NaN,
      offset: Number.POSITIVE_INFINITY,
      concurrency: 1.5,
    });

    expect(listLocalSubscriptions).toHaveBeenCalledWith({
      limit: 100,
      offset: 0,
    });
    expect(result).toEqual({
      scanned: 0,
      updated: 0,
      failed: 0,
      failures: [],
    });
  });

  it.each([
    {
      name: 'surfaces non-Error thrown values in failures',
      thrownValue: 'boom',
      expectedError: 'boom',
    },
    {
      name: 'falls back to error.name when an Error has an empty message',
      thrownValue: new Error(''),
      expectedError: 'Error',
    },
  ])('$name', async ({ thrownValue, expectedError }) => {
    const stripe = createStripeWithSubscriptions([
      createUserSubscriptionFixture('sub_1'),
    ]);
    stripe.setSubscriptionRetrieveOverride(() => {
      throw thrownValue;
    });

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: 'sub_1',
    });

    const result = await scenario.run();

    expect(result.failed).toBe(1);
    expect(result.failures[0]).toMatchObject({
      stripeSubscriptionId: 'sub_1',
      error: expectedError,
    });
  });

  it('starts consent retention when reconciliation observes a canceled subscription', async () => {
    const canceled = createUserSubscriptionFixture('sub_canceled_retention', {
      status: 'canceled',
    });
    const renewalConsentRecords = new FakeRenewalConsentRecordRepository();
    const consent = await renewalConsentRecords.save(
      newRenewalConsentRecord({
        userId: primaryUserId,
        consumerReference: 'a'.repeat(64),
        externalCustomerId: 'cus_123',
        externalSubscriptionId: canceled.id,
        checkoutSessionId: 'cs_canceled_retention',
        setupSessionId: null,
        applicationSourceId: null,
        plan: 'monthly',
        amountCents: 2900,
        currency: 'usd',
        frequency: 'month',
        trialEndsAt: null,
        cancellationDeadline: new Date('2026-09-06T12:00:00Z'),
        cancellationMethod:
          'Billing page in the app or support@addictionboards.com',
        disclosureSnapshot: 'Exact disclosure.',
        disclosureVersion: '2026-08-05',
        termsVersion: '2026-08-05',
        termsHash: 'b'.repeat(64),
        consentSource: 'stripe_checkout',
        acceptedAt: new Date('2026-08-06T12:00:00Z'),
        consentKind: 'initial_offer',
        priorAmountCents: null,
        proposedAmountCents: null,
        effectiveRenewalAt: null,
      }),
    );
    const scenario = createReconciliationTestScenario({
      stripe: createStripeWithSubscriptions([canceled]),
      renewalConsentRecords,
      localSubscriptions: [row(primaryUserId, canceled.id)],
    });

    await expect(scenario.run({ dryRun: false })).resolves.toMatchObject({
      updated: 1,
      failed: 0,
    });

    await expect(
      renewalConsentRecords.findById(consent.id),
    ).resolves.toMatchObject({
      subscriptionTerminatedAt: new Date('2026-08-07T12:00:00.000Z'),
      retainUntil: expect.any(Date),
    });
  });

  it('upserts subscriptions and customer mappings for local subscriptions', async () => {
    const scenario = createSingleRowScenario({
      stripe: createStripeWithSubscriptions([
        createUserSubscriptionFixture('sub_123'),
      ]),
      subscriptionId: 'sub_123',
    });

    const result = await scenario.run();

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });

    await expect(
      scenario.subscriptions.findByUserId(primaryUserId),
    ).resolves.toMatchObject({
      userId: primaryUserId,
      status: 'active',
      plan: 'monthly',
    });
    await expect(
      scenario.stripeCustomers.findByUserId(primaryUserId),
    ).resolves.toEqual({
      stripeCustomerId: 'cus_123',
    });
    expect(scenario.logger.errorCalls).toHaveLength(0);
  });

  it('acquires the subscription lock before writing the Stripe customer mapping', async () => {
    const calls: string[] = [];
    class OrderedSubscriptionRepository extends FakeSubscriptionRepository {
      override async upsert(
        input: Parameters<FakeSubscriptionRepository['upsert']>[0],
      ) {
        calls.push('subscriptions.upsert');
        return super.upsert(input);
      }
    }
    class OrderedStripeCustomerRepository extends FakeStripeCustomerRepository {
      override async insert(
        ...args: Parameters<FakeStripeCustomerRepository['insert']>
      ) {
        calls.push('stripeCustomers.insert');
        return super.insert(...args);
      }
    }
    const local = createUserSubscriptionFixture('sub_lock_order');
    const scenario = createReconciliationTestScenario({
      stripe: createStripeWithSubscriptions([local]),
      localSubscriptions: [row(primaryUserId, local.id)],
      subscriptions: new OrderedSubscriptionRepository(),
      stripeCustomers: new OrderedStripeCustomerRepository(),
    });

    await expect(scenario.run({ dryRun: true })).resolves.toMatchObject({
      updated: 1,
      failed: 0,
    });

    expect(calls).toEqual(['subscriptions.upsert', 'stripeCustomers.insert']);
  });

  it('logs safe database diagnostics while returning a generic failure string', async () => {
    const subscription = createUserSubscriptionFixture('sub_diagnostics');
    const postgresError = Object.assign(
      new Error('duplicate key exposes raw reconciliation text'),
      {
        code: '23505',
        constraint: 'stripe_customers_stripe_customer_id_unique',
        detail: 'Key (stripe_customer_id)=(cus_reconcile_raw) exists',
      },
    );
    const databaseError = new ApplicationError(
      'INTERNAL_ERROR',
      'Failed to upsert Stripe customer mapping',
      undefined,
      { cause: postgresError },
    );
    const scenario = createReconciliationTestScenario({
      stripe: createStripeWithSubscriptions([subscription]),
      localSubscriptions: [row(primaryUserId, subscription.id)],
      transaction: async () => {
        throw databaseError;
      },
    });

    const result = await scenario.run();

    expectSingleFailure(result, {
      stripeSubscriptionId: subscription.id,
      error: 'Failed to upsert Stripe customer mapping',
    });
    expect(scenario.logger.errorCalls).toContainEqual({
      context: {
        stripeSubscriptionId: subscription.id,
        error: {
          name: 'ApplicationError',
          code: 'INTERNAL_ERROR',
          sqlState: '23505',
          constraint: 'stripe_customers_stripe_customer_id_unique',
        },
      },
      msg: 'Stripe subscription reconciliation failed',
    });
    const serializedLog = JSON.stringify(scenario.logger.errorCalls);
    expect(serializedLog).not.toContain('raw reconciliation');
    expect(serializedLog).not.toContain('cus_reconcile_raw');
  });

  it('reports a failure when Stripe subscription metadata user id mismatches', async () => {
    const scenario = createSingleRowScenario({
      stripe: createStripeWithSubscriptions([
        createUserSubscriptionFixture('sub_123', { userId: otherUserId }),
      ]),
      subscriptionId: 'sub_123',
    });

    const result = await scenario.run();

    expect(result.scanned).toBe(1);
    expectSingleFailure(result, {
      stripeSubscriptionId: 'sub_123',
    });

    await expect(
      scenario.subscriptions.findByUserId(primaryUserId),
    ).resolves.toBeNull();
    await expect(
      scenario.stripeCustomers.findByUserId(primaryUserId),
    ).resolves.toBeNull();
    expect(scenario.logger.errorCalls.length).toBeGreaterThan(0);
  });

  it('overrides an existing stripe customer mapping when reconciliation detects a new customer id', async () => {
    const stripeCustomers = new FakeStripeCustomerRepository();
    await stripeCustomers.insert(primaryUserId, 'cus_old');

    const scenario = createSingleRowScenario({
      stripe: createStripeWithSubscriptions([
        createUserSubscriptionFixture('sub_123', { customerId: 'cus_new' }),
      ]),
      stripeCustomers,
      subscriptionId: 'sub_123',
    });
    await expectDryRunSuccess(scenario);

    await expect(
      scenario.stripeCustomers.findByUserId(primaryUserId),
    ).resolves.toEqual({
      stripeCustomerId: 'cus_new',
    });

    await expect(
      scenario.stripeCustomers.insert(secondaryUserId, 'cus_old'),
    ).resolves.toBeUndefined();
  });
});
