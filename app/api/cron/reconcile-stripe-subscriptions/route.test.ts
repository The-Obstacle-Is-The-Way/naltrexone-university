import { beforeEach, describe, expect, it, vi } from 'vitest';

const { reconcileStripeSubscriptions, createContainer } = vi.hoisted(() => ({
  reconcileStripeSubscriptions: vi.fn(),
  createContainer: vi.fn(),
}));

// Route handlers are composition roots that import adapter functions at module
// level. vi.mock() on src/ code is a known deviation from the fakes-over-mocks
// convention; it is acceptable here because the function is not DI-injected.
// importOriginal preserves the real RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT
// constant to prevent silent drift between the mock and the source module.
vi.mock(
  '@/src/adapters/jobs/reconcile-stripe-subscriptions',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/src/adapters/jobs/reconcile-stripe-subscriptions')
    >()),
    reconcileStripeSubscriptions,
  }),
);

vi.mock('@/lib/container', () => ({
  createContainer,
}));

import { RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT } from '@/src/adapters/jobs/reconcile-stripe-subscriptions';
import { POST } from './route';

type CronContainer = {
  env: {
    CRON_SECRET?: string;
    NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: string;
    NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: string;
  };
  logger: {
    error: ReturnType<typeof vi.fn>;
  };
  stripe: object;
  db: {
    query: {
      stripeSubscriptions: {
        findMany: ReturnType<typeof vi.fn>;
      };
    };
    transaction: ReturnType<typeof vi.fn>;
  };
  createStripeCustomerRepository: ReturnType<typeof vi.fn>;
  createSubscriptionRepository: ReturnType<typeof vi.fn>;
};

function createMockContainer(): CronContainer {
  return {
    env: {
      CRON_SECRET: 'test-secret',
      NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_monthly',
      NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_annual',
    },
    logger: {
      error: vi.fn(),
    },
    stripe: {},
    db: {
      query: {
        stripeSubscriptions: {
          findMany: vi.fn(async () => []),
        },
      },
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({}),
      ),
    },
    createStripeCustomerRepository: vi.fn(),
    createSubscriptionRepository: vi.fn(),
  };
}

describe('POST /api/cron/reconcile-stripe-subscriptions', () => {
  let container: CronContainer;

  beforeEach(() => {
    vi.clearAllMocks();

    reconcileStripeSubscriptions.mockResolvedValue({
      scanned: 0,
      updated: 0,
      failed: 0,
      failures: [],
    });

    container = createMockContainer();
    createContainer.mockReturnValue(container);
  });

  it('clamps request limit to MAX_LIMIT before calling reconciliation', async () => {
    const response = await POST(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?limit=750',
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-secret',
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(reconcileStripeSubscriptions).toHaveBeenCalledWith(
      {
        limit: RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT,
        offset: 0,
        dryRun: true,
      },
      expect.any(Object),
    );
  });

  it('returns 503 when CRON_SECRET is not configured', async () => {
    container.env.CRON_SECRET = undefined;

    const response = await POST(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'CRON_SECRET is not configured',
    });
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
    expect(container.logger.error).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when authorization header is missing', async () => {
    const response = await POST(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
  });

  it('returns 401 when bearer token is invalid', async () => {
    const response = await POST(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer wrong-secret',
        },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
  });

  it('parses offset and dryRun query params before reconciliation', async () => {
    const response = await POST(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?limit=12&offset=7&dryRun=false',
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-secret',
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(reconcileStripeSubscriptions).toHaveBeenCalledWith(
      {
        limit: 12,
        offset: 7,
        dryRun: false,
      },
      expect.any(Object),
    );
  });

  it('returns 500 when reconciliation throws', async () => {
    reconcileStripeSubscriptions.mockRejectedValueOnce(new Error('boom'));

    const response = await POST(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-secret',
        },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal error' });
    expect(container.logger.error).toHaveBeenCalledTimes(1);
  });
});
