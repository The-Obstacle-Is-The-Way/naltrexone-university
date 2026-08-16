import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import Stripe from 'stripe';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createReconcileStripeSubscriptionsCronHandler } from '@/app/api/cron/reconcile-stripe-subscriptions/route';
import { createSendRenewalNoticesCronHandler } from '@/app/api/cron/send-renewal-notices/route';
import * as schema from '@/db/schema';
import { createContainer } from '@/lib/container';
import { env } from '@/lib/env';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';
import { FakeTransactionalEmailGateway } from '@/src/application/test-helpers/fakes';
import { DAY_MS } from '@/src/domain/services';
import { loadJsonFixture } from '@/tests/shared/load-json-fixture';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const renewalSubscriptionIds: string[] = [];
const subscriptionsToRestore: ReconciliationRow[] = [];
const stripeCustomerUserIdsToDelete: string[] = [];
const CRON_SECRET = 'debt468-cron-integration-only';
const MONTHLY_PRICE_ID = 'price_debt468_monthly';
const ANNUAL_PRICE_ID = 'price_debt468_annual';
const NOW = new Date('2026-08-16T12:00:00.000Z');

type StripeSubscriptionFixture = {
  id: string;
  customer: string;
  status: schema.StripeSubscriptionStatus;
  cancel_at_period_end: boolean;
  metadata?: Record<string, string>;
  items: {
    data: Array<{
      current_period_end: number;
      price: { id: string };
    }>;
  };
};

type ReconciliationRow = {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  status: schema.StripeSubscriptionStatus;
  priceId: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  version: number;
  updatedAt: Date;
  stripeCustomerId: string | null;
};

class ReconciliationStripeResponse extends Stripe.HttpClientResponse {
  private readonly rawResponse: Record<string, unknown> = {};

  constructor(private readonly body: object) {
    super(200, { 'request-id': 'req_debt468_integration' });
  }

  override getRawResponse(): Record<string, unknown> {
    return this.rawResponse;
  }

  override toStream(): never {
    throw new Error('Unexpected streaming Stripe response');
  }

  override async toJSON(): Promise<object> {
    return this.body;
  }
}

class ReconciliationStripeHttpClient extends Stripe.HttpClient {
  constructor(
    private readonly subscriptions: ReadonlyMap<
      string,
      StripeSubscriptionFixture
    >,
  ) {
    super();
  }

  override getClientName(): string {
    return 'debt468-integration';
  }

  override async makeRequest(
    _host: string,
    _port: string,
    path: string,
    method: string,
  ): Promise<Stripe.HttpClientResponse> {
    if (method !== 'GET') {
      throw new Error(`Unexpected Stripe request: ${method} ${path}`);
    }

    const retrieveMatch = /^\/v1\/subscriptions\/([^?]+)$/.exec(path);
    if (retrieveMatch?.[1]) {
      const subscriptionId = decodeURIComponent(retrieveMatch[1]);
      const subscription = this.subscriptions.get(subscriptionId);
      if (!subscription) {
        throw new Error(`Unexpected subscription retrieval: ${subscriptionId}`);
      }
      return new ReconciliationStripeResponse(subscription);
    }

    if (path.startsWith('/v1/subscriptions?')) {
      return new ReconciliationStripeResponse({
        object: 'list',
        data: [],
        has_more: false,
        url: '/v1/subscriptions',
      });
    }

    throw new Error(`Unexpected Stripe request: ${method} ${path}`);
  }
}

function createTestEnv() {
  return {
    ...env,
    CRON_SECRET,
    NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: MONTHLY_PRICE_ID,
    NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: ANNUAL_PRICE_ID,
  };
}

function createReconciliationStripe(input: {
  rows: ReconciliationRow[];
  targetSubscriptionId: string;
}): Stripe {
  const event = loadJsonFixture<{
    data: { object: StripeSubscriptionFixture };
  }>('stripe/customer.subscription.updated.json');
  const base = event.data.object;
  const [baseItem] = base.items.data;
  if (!baseItem) throw new Error('Stripe fixture is missing its item');
  const externalSubscriptions = new Map(
    input.rows.map((row) => {
      const isTarget = row.stripeSubscriptionId === input.targetSubscriptionId;
      const fixture: StripeSubscriptionFixture = {
        ...base,
        id: row.stripeSubscriptionId,
        customer:
          row.stripeCustomerId ?? `cus_${randomUUID().replaceAll('-', '')}`,
        status: isTarget ? 'canceled' : row.status,
        cancel_at_period_end: row.cancelAtPeriodEnd,
        metadata: { ...(base.metadata ?? {}), user_id: row.userId },
        items: {
          ...base.items,
          data: [
            {
              ...baseItem,
              current_period_end: Math.floor(
                (isTarget
                  ? NOW.getTime() - DAY_MS
                  : row.currentPeriodEnd.getTime()) / 1000,
              ),
              price: { ...baseItem.price, id: MONTHLY_PRICE_ID },
            },
          ],
        },
      };
      return [row.stripeSubscriptionId, fixture] as const;
    }),
  );

  return new Stripe('sk_test_debt468_cron_integration', {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 0,
    httpClient: new ReconciliationStripeHttpClient(externalSubscriptions),
  });
}

function authorizedRequest(url: string): Request {
  return new Request(url, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

afterEach(async () => {
  for (const subscription of subscriptionsToRestore) {
    await db
      .update(schema.stripeSubscriptions)
      .set({
        status: subscription.status,
        priceId: subscription.priceId,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        version: subscription.version,
        updatedAt: subscription.updatedAt,
      })
      .where(eq(schema.stripeSubscriptions.id, subscription.id));
  }
  subscriptionsToRestore.length = 0;
  if (stripeCustomerUserIdsToDelete.length > 0) {
    await db
      .delete(schema.stripeCustomers)
      .where(
        inArray(schema.stripeCustomers.userId, stripeCustomerUserIdsToDelete),
      );
  }
  stripeCustomerUserIdsToDelete.length = 0;
  if (renewalSubscriptionIds.length > 0) {
    await db
      .delete(schema.renewalNoticeDeliveries)
      .where(
        inArray(
          schema.renewalNoticeDeliveries.stripeSubscriptionId,
          renewalSubscriptionIds,
        ),
      );
  }
  renewalSubscriptionIds.length = 0;
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('reconcile Stripe subscriptions cron route', () => {
  it('runs the production URL through container wiring and persists Stripe state', async () => {
    const user = await createUser(db, cleanup);
    const externalSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;
    await db.insert(schema.stripeSubscriptions).values({
      userId: user.id,
      stripeSubscriptionId: externalSubscriptionId,
      status: 'active',
      priceId: MONTHLY_PRICE_ID,
      currentPeriodEnd: new Date(NOW.getTime() + 30 * DAY_MS),
      cancelAtPeriodEnd: false,
    });
    const reconciliationRows = await db
      .select({
        id: schema.stripeSubscriptions.id,
        userId: schema.stripeSubscriptions.userId,
        stripeSubscriptionId: schema.stripeSubscriptions.stripeSubscriptionId,
        status: schema.stripeSubscriptions.status,
        priceId: schema.stripeSubscriptions.priceId,
        currentPeriodEnd: schema.stripeSubscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: schema.stripeSubscriptions.cancelAtPeriodEnd,
        version: schema.stripeSubscriptions.version,
        updatedAt: schema.stripeSubscriptions.updatedAt,
        stripeCustomerId: schema.stripeCustomers.stripeCustomerId,
      })
      .from(schema.stripeSubscriptions)
      .leftJoin(
        schema.stripeCustomers,
        eq(schema.stripeCustomers.userId, schema.stripeSubscriptions.userId),
      );
    subscriptionsToRestore.push(
      ...reconciliationRows.filter(
        (row) => row.stripeSubscriptionId !== externalSubscriptionId,
      ),
    );
    stripeCustomerUserIdsToDelete.push(
      ...reconciliationRows
        .filter((row) => row.stripeCustomerId === null)
        .map((row) => row.userId),
    );
    const stripe = createReconciliationStripe({
      rows: reconciliationRows,
      targetSubscriptionId: externalSubscriptionId,
    });
    cleanup.rateLimitKeys.push('cron:reconcile-stripe-subscriptions');
    const handler = createReconcileStripeSubscriptionsCronHandler(() =>
      createContainer({
        primitives: {
          db,
          env: createTestEnv(),
          getStripe: () => stripe,
          now: () => NOW,
        },
      }),
    );

    const response = await handler(
      authorizedRequest(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?dryRun=false&scope=all',
      ),
    );

    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      scanned: number;
      updated: number;
      failed: number;
      failures: Array<{ stripeSubscriptionId: string; error: string }>;
    };
    expect(result.failures).toEqual([]);
    expect(result.failed).toBe(0);
    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(result.updated).toBe(result.scanned);
    await expect(
      db.query.stripeSubscriptions.findFirst({
        where: eq(schema.stripeSubscriptions.userId, user.id),
      }),
    ).resolves.toMatchObject({
      stripeSubscriptionId: externalSubscriptionId,
      status: 'canceled',
      currentPeriodEnd: new Date(NOW.getTime() - DAY_MS),
    });
    await expect(
      db.query.stripeCustomers.findFirst({
        where: eq(schema.stripeCustomers.userId, user.id),
      }),
    ).resolves.toMatchObject({ userId: user.id });
  });
});

describe('send renewal notices cron route', () => {
  it('runs the production URL through container wiring and persists deliveries', async () => {
    const user = await createUser(db, cleanup);
    const externalSubscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;
    renewalSubscriptionIds.push(externalSubscriptionId);
    await db.insert(schema.stripeSubscriptions).values({
      userId: user.id,
      stripeSubscriptionId: externalSubscriptionId,
      status: 'active',
      priceId: ANNUAL_PRICE_ID,
      currentPeriodEnd: new Date(NOW.getTime() + 30 * DAY_MS),
      cancelAtPeriodEnd: false,
    });
    const email = new FakeTransactionalEmailGateway({ configured: true });
    cleanup.rateLimitKeys.push('cron:send-renewal-notices');
    const handler = createSendRenewalNoticesCronHandler(() =>
      createContainer({
        primitives: {
          db,
          env: createTestEnv(),
          now: () => NOW,
        },
        gateways: {
          createTransactionalEmailGateway: () => email,
        },
      }),
    );

    const response = await handler(
      authorizedRequest('http://localhost/api/cron/send-renewal-notices'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      subscriptions: 1,
      queued: 2,
      dispatchFailures: 0,
    });
    const deliveries = await db
      .select()
      .from(schema.renewalNoticeDeliveries)
      .where(
        eq(
          schema.renewalNoticeDeliveries.stripeSubscriptionId,
          externalSubscriptionId,
        ),
      );
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map((delivery) => delivery.noticeKind).sort()).toEqual([
      'annual_reminder',
      'renewal_notice',
    ]);
    expect(deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'delivered' }),
        expect.objectContaining({ status: 'delivered' }),
      ]),
    );
    expect(email.sendInputs).toHaveLength(2);
  });
});

describe('cron authorization', () => {
  it.each([
    {
      label: 'reconciliation',
      url: 'http://localhost/api/cron/reconcile-stripe-subscriptions?dryRun=false&scope=all',
      createHandler: () =>
        createReconcileStripeSubscriptionsCronHandler(() =>
          createContainer({ primitives: { db, env: createTestEnv() } }),
        ),
    },
    {
      label: 'renewal notices',
      url: 'http://localhost/api/cron/send-renewal-notices',
      createHandler: () =>
        createSendRenewalNoticesCronHandler(() =>
          createContainer({ primitives: { db, env: createTestEnv() } }),
        ),
    },
  ])(
    'rejects the $label production URL without authorization',
    async (input) => {
      const response = await input.createHandler()(new Request(input.url));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    },
  );
});
