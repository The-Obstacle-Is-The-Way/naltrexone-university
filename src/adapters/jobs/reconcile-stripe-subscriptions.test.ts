import { describe, expect, it, vi } from 'vitest';
import type { StripeSubscriptionStatus } from '@/src/adapters/shared/stripe-types';
import {
  FakeLogger,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { loadJsonFixture } from '@/tests/shared/load-json-fixture';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { reconcileStripeSubscriptions } from './reconcile-stripe-subscriptions';

type StripeSubscriptionFixture = {
  id: string;
  customer: string;
  status: StripeSubscriptionStatus;
  cancel_at_period_end: boolean;
  metadata?: Record<string, string>;
  items: {
    data: Array<{
      current_period_end: number;
      price: { id: string };
    }>;
  };
};

type LocalSubscriptionRow = { userId: string; stripeSubscriptionId: string };

const primaryUserId = crypto.randomUUID();
const secondaryUserId = crypto.randomUUID();
const tertiaryUserId = crypto.randomUUID();
const otherUserId = crypto.randomUUID();

type ReconciliationInput = Parameters<typeof reconcileStripeSubscriptions>[0];
type ReconciliationDeps = Parameters<typeof reconcileStripeSubscriptions>[1];
type StripeStub = {
  subscriptions: Record<
    'retrieve' | 'list' | 'cancel',
    ReturnType<typeof vi.fn>
  >;
};

type ReconciliationTestScenarioInput = {
  stripe?: ReconciliationDeps['stripe'] | StripeStub;
  localSubscriptions?: LocalSubscriptionRow[];
  listLocalSubscriptions?: (input: {
    limit: number;
    offset: number;
  }) => Promise<LocalSubscriptionRow[]>;
  stripeCustomers?: FakeStripeCustomerRepository;
  subscriptions?: FakeSubscriptionRepository;
  logger?: FakeLogger;
  transaction?: ReconciliationDeps['transaction'];
  webhookE2EOwner?: string;
};

function createSubscriptionFixture(input: {
  id: string;
  userId: string;
  customerId?: string;
  status?: StripeSubscriptionStatus;
  currentPeriodEnd?: number;
  priceId?: string;
  e2eOwner?: string;
}): StripeSubscriptionFixture {
  const subscriptionEvent = loadJsonFixture<{
    data: { object: StripeSubscriptionFixture };
  }>('stripe/customer.subscription.updated.json');
  const base = subscriptionEvent.data.object;

  return {
    ...base,
    id: input.id,
    customer: input.customerId ?? 'cus_123',
    status: input.status ?? 'active',
    metadata: {
      ...(base.metadata ?? {}),
      user_id: input.userId,
      ...(input.e2eOwner ? { e2e_owner: input.e2eOwner } : {}),
    },
    items: {
      ...base.items,
      data: [
        {
          ...base.items.data[0],
          current_period_end: input.currentPeriodEnd ?? 1_700_000_000,
          price: {
            ...base.items.data[0].price,
            id: input.priceId ?? 'price_m',
          },
        },
      ],
    },
  };
}

function createUserSubscriptionFixture(
  id: string,
  input: Omit<
    Parameters<typeof createSubscriptionFixture>[0],
    'id' | 'userId'
  > & {
    userId?: string;
  } = {},
): StripeSubscriptionFixture {
  return createSubscriptionFixture({
    id,
    userId: input.userId ?? primaryUserId,
    customerId: input.customerId,
    status: input.status,
    currentPeriodEnd: input.currentPeriodEnd,
    priceId: input.priceId,
    e2eOwner: input.e2eOwner,
  });
}

function createStripeStub(input: {
  subscriptionsById: Record<string, StripeSubscriptionFixture>;
  listedSubscriptions: Array<{
    id: string;
    status: StripeSubscriptionStatus;
  }>;
}): StripeStub {
  return {
    subscriptions: {
      retrieve: vi.fn(async (subscriptionId: string) => {
        const subscription = input.subscriptionsById[subscriptionId];
        if (!subscription) {
          throw new Error(`Unknown subscription: ${subscriptionId}`);
        }
        return subscription;
      }),
      list: vi.fn(async () => ({ data: input.listedSubscriptions })),
      cancel: vi.fn(async () => ({ id: 'sub_canceled' })),
    },
  };
}

function createStripeFromFixtures(input: {
  fixtures: Array<{
    fixture: StripeSubscriptionFixture;
    key?: string;
  }>;
  listedSubscriptions?: Array<{
    id: string;
    status: StripeSubscriptionStatus;
  }>;
}): StripeStub {
  const subscriptionsById: Record<string, StripeSubscriptionFixture> = {};
  for (const { fixture, key } of input.fixtures) {
    subscriptionsById[key ?? fixture.id] = fixture;
  }

  return createStripeStub({
    subscriptionsById,
    listedSubscriptions:
      input.listedSubscriptions ??
      input.fixtures.map(({ fixture }) => ({
        id: fixture.id,
        status: fixture.status,
      })),
  });
}

type StripeSubscriptionsApi = StripeStub['subscriptions'];

function createStripeWithSubscriptionOverrides(input: {
  retrieve: StripeSubscriptionsApi['retrieve'];
  list: StripeSubscriptionsApi['list'];
  cancel?: StripeSubscriptionsApi['cancel'];
}): StripeStub {
  const base = createStripeStub({
    subscriptionsById: {},
    listedSubscriptions: [],
  });
  return {
    ...base,
    subscriptions: {
      ...base.subscriptions,
      retrieve: input.retrieve,
      list: input.list,
      cancel: input.cancel ?? base.subscriptions.cancel,
    },
  };
}

function createReconciliationTestScenario(
  input: ReconciliationTestScenarioInput = {},
) {
  const stripeCustomers =
    input.stripeCustomers ?? new FakeStripeCustomerRepository();
  const subscriptions = input.subscriptions ?? new FakeSubscriptionRepository();
  const logger = input.logger ?? new FakeLogger();
  const stripe = (input.stripe ??
    createStripeStub({
      subscriptionsById: {},
      listedSubscriptions: [],
    })) as ReconciliationDeps['stripe'];
  const listLocalSubscriptions =
    input.listLocalSubscriptions ??
    (async () => input.localSubscriptions ?? []);
  const transaction =
    input.transaction ?? (async (fn) => fn({ stripeCustomers, subscriptions }));

  async function run(overrides: Partial<ReconciliationInput> = {}) {
    return reconcileStripeSubscriptions(
      {
        limit: 10,
        offset: 0,
        ...overrides,
      },
      {
        stripe,
        priceIds: { monthly: 'price_m', annual: 'price_a' },
        logger,
        webhookE2EOwner: input.webhookE2EOwner,
        listLocalSubscriptions,
        transaction,
      },
    );
  }

  return {
    stripeCustomers,
    subscriptions,
    logger,
    stripe,
    listLocalSubscriptions,
    run,
  };
}

function row(
  userId: string,
  stripeSubscriptionId: string,
): LocalSubscriptionRow {
  return { userId, stripeSubscriptionId };
}

function createSingleRowScenario(input: {
  stripe: ReconciliationDeps['stripe'] | StripeStub;
  subscriptionId: string;
  userId?: string;
  stripeCustomers?: FakeStripeCustomerRepository;
}) {
  return createReconciliationTestScenario({
    stripe: input.stripe,
    stripeCustomers: input.stripeCustomers,
    localSubscriptions: [
      row(input.userId ?? primaryUserId, input.subscriptionId),
    ],
  });
}

async function expectDryRunSuccess(
  scenario: ReturnType<typeof createReconciliationTestScenario>,
): Promise<void> {
  await expect(scenario.run({ dryRun: true })).resolves.toMatchObject({
    updated: 1,
    failed: 0,
  });
}

function expectSingleFailure(
  result: Awaited<
    ReturnType<ReturnType<typeof createReconciliationTestScenario>['run']>
  >,
  input: { stripeSubscriptionId: string; error?: string },
): void {
  expect(result.updated).toBe(0);
  expect(result.failed).toBe(1);
  expect(result.failures).toHaveLength(1);
  expect(result.failures[0]).toMatchObject(input);
}

describe('reconcileStripeSubscriptions', () => {
  it('processes rows with bounded concurrency (default 10)', async () => {
    async function flushUntil(
      condition: () => boolean,
      input?: { maxTicks?: number },
    ) {
      const maxTicks = input?.maxTicks ?? 50;
      for (let i = 0; i < maxTicks; i += 1) {
        if (condition()) return;
        await Promise.resolve();
      }
      throw new Error('Timed out waiting for condition');
    }

    const rows = Array.from({ length: 12 }, (_, i) => ({
      userId: crypto.randomUUID(),
      stripeSubscriptionId: `sub_${i + 1}`,
    }));

    const subscriptionsById: Record<string, StripeSubscriptionFixture> = {};
    const subscriptionIdByCustomerId = new Map<string, string>();
    for (const row of rows) {
      const customerId = `cus_${row.stripeSubscriptionId}`;
      subscriptionsById[row.stripeSubscriptionId] =
        createUserSubscriptionFixture(row.stripeSubscriptionId, {
          userId: row.userId,
          customerId,
          status: 'active',
        });
      subscriptionIdByCustomerId.set(customerId, row.stripeSubscriptionId);
    }

    let inFlight = 0;
    let maxInFlight = 0;
    const deferredBySubscriptionId = new Map<
      string,
      ReturnType<typeof createDeferred<StripeSubscriptionFixture>>
    >();

    const retrieve = vi.fn((subscriptionId: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      const deferred = createDeferred<StripeSubscriptionFixture>();
      deferredBySubscriptionId.set(subscriptionId, deferred);

      return deferred.promise.finally(() => {
        inFlight -= 1;
      });
    });

    const list = vi.fn(async (input: { customer: string }) => {
      const subscriptionId = subscriptionIdByCustomerId.get(input.customer);
      if (!subscriptionId) {
        throw new Error(`Unknown customer: ${input.customer}`);
      }
      return {
        data: [{ id: subscriptionId, status: 'active' as const }],
      };
    });

    const stripe = createStripeWithSubscriptionOverrides({
      retrieve,
      list,
      cancel: vi.fn(async () => ({ id: 'sub_canceled' })),
    });

    const scenario = createReconciliationTestScenario({
      stripe,
      localSubscriptions: rows,
    });

    const promise = scenario.run({ limit: 20 });

    await flushUntil(() => retrieve.mock.calls.length === 10);

    expect(retrieve).toHaveBeenCalledTimes(10);
    expect(maxInFlight).toBe(10);

    for (const row of rows.slice(0, 10)) {
      const fixture = subscriptionsById[row.stripeSubscriptionId];
      const deferred = deferredBySubscriptionId.get(row.stripeSubscriptionId);
      if (!fixture || !deferred) {
        throw new Error(`Missing data for ${row.stripeSubscriptionId}`);
      }
      deferred.resolve(fixture);
    }

    await flushUntil(() => retrieve.mock.calls.length === 12);

    for (const row of rows.slice(10)) {
      const fixture = subscriptionsById[row.stripeSubscriptionId];
      const deferred = deferredBySubscriptionId.get(row.stripeSubscriptionId);
      if (!fixture || !deferred) {
        throw new Error(`Missing data for ${row.stripeSubscriptionId}`);
      }
      deferred.resolve(fixture);
    }

    await expect(promise).resolves.toMatchObject({
      scanned: 12,
      updated: 12,
      failed: 0,
    });
  });

  it('continues processing remaining rows when one row fails under concurrency', async () => {
    const goodSub1 = createUserSubscriptionFixture('sub_1', {
      customerId: 'cus_1',
    });
    const goodSub3 = createUserSubscriptionFixture('sub_3', {
      userId: tertiaryUserId,
      customerId: 'cus_3',
    });
    const badSub = createUserSubscriptionFixture('sub_2', {
      userId: otherUserId,
      customerId: 'cus_2',
    });

    const subscriptionsByCustomer: Record<
      string,
      Array<{ id: string; status: 'active' }>
    > = {
      cus_1: [{ id: 'sub_1', status: 'active' }],
      cus_2: [{ id: 'sub_2', status: 'active' }],
      cus_3: [{ id: 'sub_3', status: 'active' }],
    };

    const stripe = createStripeWithSubscriptionOverrides({
      retrieve: vi.fn(async (subscriptionId: string) => {
        const map: Record<string, StripeSubscriptionFixture> = {
          sub_1: goodSub1,
          sub_2: badSub,
          sub_3: goodSub3,
        };
        const sub = map[subscriptionId];
        if (!sub) throw new Error(`Unknown: ${subscriptionId}`);
        return sub;
      }),
      list: vi.fn(async (input: { customer: string }) => ({
        data: subscriptionsByCustomer[input.customer] ?? [],
      })),
      cancel: vi.fn(async () => ({ id: 'sub_canceled' })),
    });

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
    const fullStripe = createStripeStub({
      subscriptionsById: {},
      listedSubscriptions: [],
    });
    const stripe = {
      ...fullStripe,
      subscriptions: undefined,
    } as unknown as ReconciliationDeps['stripe'];

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
    const stripe = createStripeFromFixtures({
      fixtures: [{ fixture: missingMetadataSubscription }],
    });
    const scenario = createSingleRowScenario({
      stripe,
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
        error: 'Stripe subscription metadata.user_id is required',
      }),
      msg: 'Stripe subscription reconciliation failed',
    });
  });

  it('keeps reconciliation fail-closed when Stripe subscription e2e owner differs from configured owner', async () => {
    const ownerMismatchSubscription = createUserSubscriptionFixture(
      'sub_owner_mismatch',
      {
        e2eOwner: 'github-ci',
      },
    );
    const stripe = createStripeFromFixtures({
      fixtures: [{ fixture: ownerMismatchSubscription }],
    });
    const scenario = createReconciliationTestScenario({
      stripe,
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
        error:
          'Stripe subscription metadata.e2e_owner does not match this webhook owner',
      }),
      msg: 'Stripe subscription reconciliation failed',
    });
  });

  it('fails loudly when the local subscription list contains holes (internal invariant)', async () => {
    const sparseRows = new Array<LocalSubscriptionRow>(1);
    const stripe = createStripeStub({
      subscriptionsById: {},
      listedSubscriptions: [],
    });

    const scenario = createReconciliationTestScenario({
      stripe,
      listLocalSubscriptions: async () => sparseRows as LocalSubscriptionRow[],
    });

    await expect(scenario.run({ concurrency: 1 })).rejects.toThrow(
      'mapWithConcurrencyLimit: missing item at index 0',
    );
  });

  it('defaults invalid numeric inputs using safe fallbacks', async () => {
    const stripe = createStripeStub({
      subscriptionsById: {},
      listedSubscriptions: [],
    });

    const listLocalSubscriptions = vi.fn(async () => []);
    const scenario = createReconciliationTestScenario({
      stripe,
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
    const baseStripe = createStripeStub({
      subscriptionsById: {},
      listedSubscriptions: [],
    });

    const stripe = {
      ...baseStripe,
      subscriptions: {
        ...baseStripe.subscriptions,
        retrieve: vi.fn(async () => {
          throw thrownValue;
        }),
      },
    } as const;

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

  it('does not attempt canonical selection when Stripe returns no blocking subscriptions', async () => {
    const canceled = createUserSubscriptionFixture('sub_canceled', {
      status: 'canceled',
    });
    const stripe = createStripeFromFixtures({
      fixtures: [{ fixture: canceled }],
      listedSubscriptions: [],
    });

    const scenario = createSingleRowScenario({
      stripe,
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
    const local = createUserSubscriptionFixture('sub_local', {
      customerId: 'cus_1',
      status: 'active',
    });
    const blockingMismatch = createUserSubscriptionFixture('sub_blocking', {
      userId: otherUserId,
      customerId: 'cus_1',
      status: 'active',
    });

    const stripe = createStripeFromFixtures({
      fixtures: [{ fixture: local }, { fixture: blockingMismatch }],
    });

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: local.id,
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

  it.each([
    {
      name: 'reports a failure when the canonical Stripe subscription cannot be determined',
      createBlocking: () =>
        createUserSubscriptionFixture('', { status: 'active' }),
      expectedError: 'Unable to determine canonical Stripe subscription',
    },
    {
      name: 'reports a failure when canonical Stripe subscription data is missing',
      createBlocking: () =>
        createUserSubscriptionFixture('sub_other', { status: 'active' }),
      expectedError: 'Canonical Stripe subscription data is missing',
    },
  ])('$name', async ({ createBlocking, expectedError }) => {
    const localCanceled = createUserSubscriptionFixture('sub_local', {
      status: 'canceled',
    });

    const stripe = createStripeFromFixtures({
      fixtures: [
        { fixture: localCanceled },
        { fixture: createBlocking(), key: 'sub_blocking' },
      ],
      listedSubscriptions: [{ id: 'sub_blocking', status: 'active' }],
    });

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: localCanceled.id,
    });

    const result = await scenario.run({ dryRun: true });

    expectSingleFailure(result, {
      stripeSubscriptionId: localCanceled.id,
      error: expectedError,
    });
  });

  it('upserts subscriptions and customer mappings for local subscriptions', async () => {
    const subscription = createUserSubscriptionFixture('sub_123');
    const stripe = createStripeFromFixtures({
      fixtures: [{ fixture: subscription }],
    });

    const scenario = createSingleRowScenario({
      stripe,
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

  // The canonical blocking subscription is selected from the full blocking set:
  // highest currentPeriodEnd wins, then externalSubscriptionId asc breaks ties.
  it('cancels duplicate blocking subscriptions when dryRun is disabled', async () => {
    const keep = createUserSubscriptionFixture('sub_keep', {
      status: 'active',
      currentPeriodEnd: 1_700_000_000,
    });
    const duplicateOne = createUserSubscriptionFixture('sub_dup_1', {
      status: 'trialing',
      currentPeriodEnd: 1_700_000_100,
    });
    const duplicateTwo = createUserSubscriptionFixture('sub_dup_2', {
      status: 'past_due',
      currentPeriodEnd: 1_700_000_200,
    });

    const stripe = createStripeFromFixtures({
      fixtures: [
        { fixture: keep },
        { fixture: duplicateOne },
        { fixture: duplicateTwo },
      ],
    });

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: keep.id,
    });

    const result = await scenario.run({ dryRun: false });

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(2);
    expect(stripe.subscriptions.cancel).toHaveBeenNthCalledWith(
      1,
      'sub_keep',
      undefined,
      {
        idempotencyKey: 'reconcile_duplicate_subscription:sub_keep',
      },
    );
    expect(stripe.subscriptions.cancel).toHaveBeenNthCalledWith(
      2,
      'sub_dup_1',
      undefined,
      { idempotencyKey: 'reconcile_duplicate_subscription:sub_dup_1' },
    );
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
    const keep = createUserSubscriptionFixture('sub_keep', {
      status: 'active',
      currentPeriodEnd: 1_700_000_000,
    });
    const duplicateOne = createUserSubscriptionFixture('sub_dup_1', {
      status: 'trialing',
      currentPeriodEnd: 1_700_000_100,
    });
    const duplicateTwo = createUserSubscriptionFixture('sub_dup_2', {
      status: 'past_due',
      currentPeriodEnd: 1_700_000_200,
    });

    const stripe = createStripeFromFixtures({
      fixtures: [
        { fixture: keep },
        { fixture: duplicateOne },
        { fixture: duplicateTwo },
      ],
    });
    stripe.subscriptions.cancel.mockImplementation(
      async (subscriptionId: string) => {
        if (subscriptionId === 'sub_keep') {
          throw Object.assign(new Error('No such subscription: sub_keep'), {
            rawType: 'invalid_request_error',
            code: 'resource_missing',
          });
        }

        return { id: `${subscriptionId}_canceled` };
      },
    );

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: keep.id,
    });

    const result = await scenario.run({ dryRun: false });

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(2);
    expect(stripe.subscriptions.cancel).toHaveBeenNthCalledWith(
      1,
      'sub_keep',
      undefined,
      {
        idempotencyKey: 'reconcile_duplicate_subscription:sub_keep',
      },
    );
    expect(stripe.subscriptions.cancel).toHaveBeenNthCalledWith(
      2,
      'sub_dup_1',
      undefined,
      { idempotencyKey: 'reconcile_duplicate_subscription:sub_dup_1' },
    );
    expect(scenario.logger.infoCalls).toEqual([
      {
        context: { stripeSubscriptionId: 'sub_keep' },
        msg: 'Duplicate subscription already canceled externally',
      },
    ]);
  });

  it('excludes already-canceled duplicates from the cancellation summary log', async () => {
    const keep = createUserSubscriptionFixture('sub_keep', {
      status: 'active',
      currentPeriodEnd: 1_700_000_000,
    });
    const duplicateOne = createUserSubscriptionFixture('sub_dup_1', {
      status: 'trialing',
      currentPeriodEnd: 1_700_000_100,
    });
    const duplicateTwo = createUserSubscriptionFixture('sub_dup_2', {
      status: 'past_due',
      currentPeriodEnd: 1_700_000_200,
    });

    const stripe = createStripeFromFixtures({
      fixtures: [
        { fixture: keep },
        { fixture: duplicateOne },
        { fixture: duplicateTwo },
      ],
    });
    stripe.subscriptions.cancel.mockImplementation(
      async (subscriptionId: string) => {
        if (subscriptionId === 'sub_keep') {
          throw Object.assign(new Error('No such subscription: sub_keep'), {
            rawType: 'invalid_request_error',
            code: 'resource_missing',
          });
        }

        return { id: `${subscriptionId}_canceled` };
      },
    );

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: keep.id,
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
    const keep = createUserSubscriptionFixture('sub_keep', {
      status: 'active',
      currentPeriodEnd: 1_700_000_000,
    });
    const duplicateOne = createUserSubscriptionFixture('sub_dup_1', {
      status: 'trialing',
      currentPeriodEnd: 1_700_000_100,
    });
    const duplicateTwo = createUserSubscriptionFixture('sub_dup_2', {
      status: 'past_due',
      currentPeriodEnd: 1_700_000_200,
    });

    const stripe = createStripeFromFixtures({
      fixtures: [
        { fixture: keep },
        { fixture: duplicateOne },
        { fixture: duplicateTwo },
      ],
    });
    stripe.subscriptions.cancel.mockRejectedValue(
      Object.assign(new Error('No such subscription'), {
        rawType: 'invalid_request_error',
        code: 'resource_missing',
      }),
    );

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: keep.id,
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
    const keep = createUserSubscriptionFixture('sub_keep', {
      status: 'active',
    });
    const duplicate = createUserSubscriptionFixture('sub_dup', {
      status: 'trialing',
    });

    const stripe = createStripeFromFixtures({
      fixtures: [{ fixture: keep }, { fixture: duplicate }],
    });

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: keep.id,
    });
    await expectDryRunSuccess(scenario);

    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('replaces a stale non-blocking local subscription with the blocking Stripe subscription', async () => {
    const localCanceled = createUserSubscriptionFixture('sub_local_canceled', {
      status: 'canceled',
      currentPeriodEnd: 1_700_000_000,
    });
    const active = createUserSubscriptionFixture('sub_active', {
      status: 'active',
      currentPeriodEnd: 1_700_001_000,
    });
    const trialing = createUserSubscriptionFixture('sub_trialing', {
      status: 'trialing',
      currentPeriodEnd: 1_700_000_500,
    });

    const stripe = createStripeFromFixtures({
      fixtures: [
        { fixture: localCanceled },
        { fixture: active },
        { fixture: trialing },
      ],
      listedSubscriptions: [
        { id: active.id, status: active.status },
        { id: trialing.id, status: trialing.status },
      ],
    });

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: localCanceled.id,
    });
    await expectDryRunSuccess(scenario);

    await expect(
      scenario.subscriptions.findByUserId(primaryUserId),
    ).resolves.toMatchObject({
      status: 'active',
    });
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId(active.id),
    ).resolves.toMatchObject({
      userId: primaryUserId,
      status: 'active',
    });
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId(trialing.id),
    ).resolves.toBeNull();
    await expect(
      scenario.subscriptions.findByExternalSubscriptionId(localCanceled.id),
    ).resolves.toBeNull();
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('selects canonical by highest currentPeriodEnd even when local row is blocking', async () => {
    const local = createUserSubscriptionFixture('sub_local', {
      status: 'active',
      currentPeriodEnd: 1_700_000_000,
    });
    const better = createUserSubscriptionFixture('sub_better', {
      status: 'active',
      currentPeriodEnd: 1_800_000_000,
    });

    const stripe = createStripeFromFixtures({
      fixtures: [{ fixture: local }, { fixture: better }],
    });

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: local.id,
    });

    const result = await scenario.run({ dryRun: false });

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith(
      'sub_local',
      undefined,
      {
        idempotencyKey: 'reconcile_duplicate_subscription:sub_local',
      },
    );
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
    const local = createUserSubscriptionFixture('sub_z', {
      status: 'active',
      currentPeriodEnd: 1_800_000_000,
    });
    const betterTieBreak = createUserSubscriptionFixture('sub_a', {
      status: 'active',
      currentPeriodEnd: 1_800_000_000,
    });

    const stripe = createStripeFromFixtures({
      fixtures: [{ fixture: local }, { fixture: betterTieBreak }],
    });

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: local.id,
    });

    const result = await scenario.run({ dryRun: false });

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
      failures: [],
    });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith(
      'sub_z',
      undefined,
      {
        idempotencyKey: 'reconcile_duplicate_subscription:sub_z',
      },
    );
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

  it('fails the row when Stripe cancel returns an unexpected authentication error', async () => {
    const local = createUserSubscriptionFixture('sub_local', {
      status: 'active',
      currentPeriodEnd: 1_700_000_000,
    });
    const better = createUserSubscriptionFixture('sub_better', {
      status: 'active',
      currentPeriodEnd: 1_800_000_000,
    });

    const stripe = createStripeFromFixtures({
      fixtures: [{ fixture: local }, { fixture: better }],
    });
    stripe.subscriptions.cancel.mockRejectedValueOnce(
      Object.assign(new Error('Invalid API Key provided'), {
        rawType: 'authentication_error',
      }),
    );

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: local.id,
    });

    const result = await scenario.run({ dryRun: false });

    expectSingleFailure(result, {
      stripeSubscriptionId: local.id,
      error: 'Invalid API Key provided',
    });
    expect(scenario.logger.infoCalls).toEqual([]);
  });

  it('persists the canonical subscription before attempting duplicate cancellation', async () => {
    const local = createUserSubscriptionFixture('sub_local', {
      status: 'active',
      currentPeriodEnd: 1_700_000_000,
    });
    const better = createUserSubscriptionFixture('sub_better', {
      status: 'active',
      currentPeriodEnd: 1_800_000_000,
    });

    const stripe = createStripeFromFixtures({
      fixtures: [{ fixture: local }, { fixture: better }],
    });
    stripe.subscriptions.cancel.mockRejectedValueOnce(
      new Error('cancel failed'),
    );

    const subscriptions = new FakeSubscriptionRepository();
    await subscriptions.upsert({
      userId: primaryUserId,
      externalSubscriptionId: local.id,
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date(1_700_000_000 * 1000),
      cancelAtPeriodEnd: false,
    });

    const scenario = createReconciliationTestScenario({
      stripe,
      subscriptions,
      localSubscriptions: [row(primaryUserId, local.id)],
    });

    const result = await scenario.run({ dryRun: false });

    expectSingleFailure(result, {
      stripeSubscriptionId: local.id,
      error: 'cancel failed',
    });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith(
      'sub_local',
      undefined,
      {
        idempotencyKey: 'reconcile_duplicate_subscription:sub_local',
      },
    );
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
    const local = createUserSubscriptionFixture('sub_local', {
      status: 'active',
      currentPeriodEnd: 1_700_000_000,
    });
    const better = createUserSubscriptionFixture('sub_better', {
      status: 'active',
      currentPeriodEnd: 1_800_000_000,
    });

    const stripe = createStripeFromFixtures({
      fixtures: [{ fixture: local }, { fixture: better }],
    });

    const subscriptions = new FakeSubscriptionRepository();
    await subscriptions.upsert({
      userId: primaryUserId,
      externalSubscriptionId: local.id,
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date(1_700_000_000 * 1000),
      cancelAtPeriodEnd: false,
    });

    const scenario = createReconciliationTestScenario({
      stripe,
      subscriptions,
      localSubscriptions: [row(primaryUserId, local.id)],
      transaction: async () => {
        throw new Error('db failed');
      },
    });

    const result = await scenario.run({ dryRun: false });

    expectSingleFailure(result, {
      stripeSubscriptionId: local.id,
      error: 'db failed',
    });
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
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

  it('breaks ties deterministically when multiple blocking subscriptions share the same currentPeriodEnd', async () => {
    const localCanceled = createUserSubscriptionFixture('sub_local_canceled', {
      status: 'canceled',
      currentPeriodEnd: 1_700_000_000,
    });
    const a = createUserSubscriptionFixture('sub_a', {
      status: 'active',
      currentPeriodEnd: 1_700_001_000,
    });
    const b = createUserSubscriptionFixture('sub_b', {
      status: 'active',
      currentPeriodEnd: 1_700_001_000,
    });

    const stripe = createStripeFromFixtures({
      fixtures: [{ fixture: localCanceled }, { fixture: a }, { fixture: b }],
      listedSubscriptions: [
        { id: b.id, status: b.status },
        { id: a.id, status: a.status },
      ],
    });

    const scenario = createSingleRowScenario({
      stripe,
      subscriptionId: localCanceled.id,
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

  it('reports a failure when Stripe subscription metadata user id mismatches', async () => {
    const mismatch = createUserSubscriptionFixture('sub_123', {
      userId: otherUserId,
    });
    const stripe = createStripeFromFixtures({
      fixtures: [{ fixture: mismatch }],
    });

    const scenario = createSingleRowScenario({
      stripe,
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
    const subscription = createUserSubscriptionFixture('sub_123', {
      customerId: 'cus_new',
    });
    const stripe = createStripeFromFixtures({
      fixtures: [{ fixture: subscription }],
    });

    const stripeCustomers = new FakeStripeCustomerRepository();
    await stripeCustomers.insert(primaryUserId, 'cus_old');

    const scenario = createSingleRowScenario({
      stripe,
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
