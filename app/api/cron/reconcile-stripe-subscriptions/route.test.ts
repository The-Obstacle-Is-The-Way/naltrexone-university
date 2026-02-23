import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimiter } from '@/src/application/ports/gateways';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';

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

import {
  RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY,
  RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT,
} from '@/src/adapters/jobs/reconcile-stripe-subscriptions';
import { POST } from './route';

type CronContainer = {
  env: {
    CRON_SECRET?: string;
    NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: string;
    NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: string;
  };
  logger: {
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  createRateLimiter: () => RateLimiter;
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
  const rateLimiter = new FakeRateLimiter();

  return {
    env: {
      CRON_SECRET: 'test-secret',
      NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_monthly',
      NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_annual',
    },
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
    },
    createRateLimiter: () => rateLimiter,
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
    expect(container.logger.warn).toHaveBeenCalledWith(
      {
        route: '/api/cron/reconcile-stripe-subscriptions',
        reason: 'missing_authorization_header',
      },
      'Unauthorized cron request',
    );
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
    expect(container.logger.warn).toHaveBeenCalledWith(
      {
        route: '/api/cron/reconcile-stripe-subscriptions',
        reason: 'invalid_token',
      },
      'Unauthorized cron request',
    );
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

  it('parses concurrency query param before reconciliation when provided', async () => {
    const response = await POST(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?limit=12&offset=7&dryRun=false&concurrency=3',
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
        concurrency: 3,
      },
      expect.any(Object),
    );
  });

  it('clamps concurrency=0 to 1', async () => {
    const response = await POST(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?concurrency=0',
        {
          method: 'POST',
          headers: { authorization: 'Bearer test-secret' },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(reconcileStripeSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ concurrency: 1 }),
      expect.any(Object),
    );
  });

  it('falls back concurrency=-1 to default then clamps', async () => {
    const response = await POST(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?concurrency=-1',
        {
          method: 'POST',
          headers: { authorization: 'Bearer test-secret' },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(reconcileStripeSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY,
      }),
      expect.any(Object),
    );
  });

  it('falls back malformed concurrency to default', async () => {
    const response = await POST(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?concurrency=abc',
        {
          method: 'POST',
          headers: { authorization: 'Bearer test-secret' },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(reconcileStripeSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY,
      }),
      expect.any(Object),
    );
  });

  it('returns 429 when rate limited', async () => {
    const rateLimiter = new FakeRateLimiter({
      success: false,
      limit: 5,
      remaining: 0,
      retryAfterSeconds: 42,
    });
    container.createRateLimiter = () => rateLimiter;

    const response = await POST(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-secret',
        },
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: 'Too many requests',
    });
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(rateLimiter.inputs).toEqual([
      {
        key: 'cron:reconcile-stripe-subscriptions',
        limit: 5,
        windowMs: 60_000,
      },
    ]);
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
  });

  it('returns 503 when the rate limiter fails', async () => {
    const rateLimiter = new FakeRateLimiter(new Error('rate limiter down'));
    container.createRateLimiter = () => rateLimiter;

    const response = await POST(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-secret',
        },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Rate limiter unavailable',
    });
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
    expect(container.logger.error).toHaveBeenCalledTimes(1);
  });

  it('falls back to safe defaults when query params are malformed', async () => {
    const response = await POST(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?limit=abc&offset=-1&dryRun=notbool',
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
        limit: 100,
        offset: 0,
        dryRun: true,
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
