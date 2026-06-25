import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimiter } from '@/src/application/ports/gateways';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';

const {
  reconcileStripeSubscriptions,
  reconcileAllStripeSubscriptionPages,
  drainPendingStripeCancellations,
  createContainer,
} = vi.hoisted(() => ({
  reconcileStripeSubscriptions: vi.fn(),
  reconcileAllStripeSubscriptionPages: vi.fn(),
  drainPendingStripeCancellations: vi.fn(),
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

vi.mock(
  '@/src/adapters/jobs/reconcile-all-stripe-subscription-pages',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/src/adapters/jobs/reconcile-all-stripe-subscription-pages')
    >()),
    reconcileAllStripeSubscriptionPages,
  }),
);

vi.mock('@/lib/container', () => ({
  createContainer,
}));

vi.mock('@/src/adapters/jobs/drain-pending-stripe-cancellations', () => ({
  drainPendingStripeCancellations,
  PENDING_STRIPE_CANCELLATION_STALE_AFTER_MINUTES: 15,
}));

import {
  RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY,
  RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT,
} from '@/src/adapters/jobs/reconcile-stripe-subscriptions';
import { GET, POST } from './route';

type CronContainer = {
  env: {
    CRON_SECRET?: string | undefined;
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
  createPendingStripeCancellationRepository: ReturnType<typeof vi.fn>;
};

function createMockContainer(): CronContainer {
  const rateLimiter = new FakeRateLimiter();
  const pendingStripeCancellationRepository = {};

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
    createPendingStripeCancellationRepository: vi.fn(
      () => pendingStripeCancellationRepository,
    ),
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
    reconcileAllStripeSubscriptionPages.mockResolvedValue({
      scanned: 0,
      updated: 0,
      failed: 0,
      failures: [],
      pagesScanned: 1,
      stoppedEarly: false,
      nextOffset: null,
    });
    drainPendingStripeCancellations.mockResolvedValue({
      scanned: 0,
      drained: 0,
      failed: 0,
      failures: [],
      dryRun: true,
    });

    container = createMockContainer();
    createContainer.mockReturnValue(container);
  });

  it('clamps request limit to MAX_LIMIT before calling all-pages reconciliation', async () => {
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
    expect(reconcileAllStripeSubscriptionPages).toHaveBeenCalledWith(
      {
        limit: RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT,
        dryRun: true,
      },
      expect.objectContaining({
        logger: container.logger,
        now: expect.any(Function),
        reconcilePage: expect.any(Function),
      }),
    );
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
  });

  it('runs all-pages mode by default and surfaces coverage fields in the response', async () => {
    reconcileAllStripeSubscriptionPages.mockResolvedValueOnce({
      scanned: 125,
      updated: 124,
      failed: 1,
      failures: [{ stripeSubscriptionId: 'sub_failed', error: 'row failed' }],
      pagesScanned: 2,
      stoppedEarly: false,
      nextOffset: null,
    });
    drainPendingStripeCancellations.mockResolvedValueOnce({
      scanned: 1,
      drained: 1,
      failed: 0,
      failures: [],
      dryRun: false,
    });

    const response = await POST(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?dryRun=false',
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-secret',
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      scanned: 125,
      updated: 124,
      failed: 1,
      failures: [{ stripeSubscriptionId: 'sub_failed', error: 'row failed' }],
      pagesScanned: 2,
      stoppedEarly: false,
      nextOffset: null,
      pendingStripeCancellations: {
        scanned: 1,
        drained: 1,
        failed: 0,
        failures: [],
        dryRun: false,
      },
    });
    expect(reconcileAllStripeSubscriptionPages).toHaveBeenCalledWith(
      {
        limit: 100,
        dryRun: false,
      },
      expect.any(Object),
    );
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
    const allPagesDeps = reconcileAllStripeSubscriptionPages.mock.calls[0]?.[1];
    if (!allPagesDeps) throw new Error('expected all-pages deps');
    await allPagesDeps.reconcilePage({ limit: 2, offset: 3, dryRun: false });
    const pageDeps = reconcileStripeSubscriptions.mock.calls[0]?.[1];
    if (!pageDeps) throw new Error('expected single-page deps');
    container.db.query.stripeSubscriptions.findMany.mockResolvedValueOnce([
      { userId: 'user_1', stripeSubscriptionId: 'sub_1' },
    ]);
    await expect(
      pageDeps.listLocalSubscriptions({ limit: 2, offset: 3 }),
    ).resolves.toEqual([{ userId: 'user_1', stripeSubscriptionId: 'sub_1' }]);
    const query =
      container.db.query.stripeSubscriptions.findMany.mock.calls.at(-1)?.[0];
    expect(query).toMatchObject({
      columns: { userId: true, stripeSubscriptionId: true },
      limit: 2,
      offset: 3,
    });
    expect(
      query.orderBy(
        { userId: 'userIdColumn' },
        { asc: (column: unknown) => ['asc', column] },
      ),
    ).toEqual([['asc', 'userIdColumn']]);
    const stripeCustomers = {};
    const subscriptions = {};
    container.createStripeCustomerRepository.mockReturnValueOnce(
      stripeCustomers,
    );
    container.createSubscriptionRepository.mockReturnValueOnce(subscriptions);
    await expect(
      pageDeps.transaction(async (tx: unknown) => tx),
    ).resolves.toEqual({ stripeCustomers, subscriptions });
  });

  it('uses all-pages mode when scope=all even if offset is present', async () => {
    const response = await POST(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?scope=all&limit=12&offset=7&dryRun=false&concurrency=3',
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-secret',
          },
        },
      ),
    );
    expect(response.status).toBe(200);
    expect(reconcileAllStripeSubscriptionPages).toHaveBeenCalledWith(
      {
        limit: 12,
        dryRun: false,
        concurrency: 3,
      },
      expect.any(Object),
    );
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
  });

  it('uses single-page mode when scope=page is explicit', async () => {
    const response = await POST(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?scope=page&limit=12&dryRun=false&concurrency=3',
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
        offset: 0,
        dryRun: false,
        concurrency: 3,
      },
      expect.any(Object),
    );
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
  });

  it('returns 401 when authorization header is missing even when CRON_SECRET is not configured', async () => {
    container.env.CRON_SECRET = undefined;

    const response = await POST(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
    expect(container.logger.warn).toHaveBeenCalledWith(
      {
        route: '/api/cron/reconcile-stripe-subscriptions',
        reason: 'missing_authorization_header',
      },
      'Unauthorized cron request',
    );
    expect(container.logger.error).not.toHaveBeenCalled();
  });

  it('returns 401 without leaking config state when Bearer token is present but CRON_SECRET is not configured', async () => {
    container.env.CRON_SECRET = undefined;

    const response = await POST(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer some-token',
        },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
    expect(container.logger.warn).not.toHaveBeenCalled();
    expect(container.logger.error).toHaveBeenCalledWith(
      { route: '/api/cron/reconcile-stripe-subscriptions' },
      'CRON_SECRET is not configured',
    );
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
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
    expect(container.logger.warn).toHaveBeenCalledWith(
      {
        route: '/api/cron/reconcile-stripe-subscriptions',
        reason: 'missing_authorization_header',
      },
      'Unauthorized cron request',
    );
  });

  it('returns 401 when authorization header is malformed', async () => {
    const response = await POST(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'POST',
        headers: {
          authorization: 'Basic abc123',
        },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
    expect(container.logger.warn).toHaveBeenCalledWith(
      {
        route: '/api/cron/reconcile-stripe-subscriptions',
        reason: 'malformed_authorization_header',
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
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
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
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
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
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
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
    expect(reconcileAllStripeSubscriptionPages).toHaveBeenCalledWith(
      expect.objectContaining({ concurrency: 1 }),
      expect.any(Object),
    );
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
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
    expect(reconcileAllStripeSubscriptionPages).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY,
      }),
      expect.any(Object),
    );
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
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
    expect(reconcileAllStripeSubscriptionPages).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY,
      }),
      expect.any(Object),
    );
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
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
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
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
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
    expect(container.logger.error).toHaveBeenCalledTimes(1);
  });

  it('falls back to safe defaults when query params are malformed', async () => {
    const response = await POST(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?scope=unknown&limit=abc&offset=-1&dryRun=notbool',
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
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
  });

  it('returns 500 when all-pages reconciliation throws before any page succeeds', async () => {
    reconcileAllStripeSubscriptionPages.mockRejectedValueOnce(
      new Error('boom'),
    );

    const response = await POST(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-secret',
        },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal error',
      reconciliationFailed: true,
      drainFailed: false,
    });
    expect(container.logger.error).toHaveBeenCalledTimes(1);
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
    // BUG-262: the drain must still run when reconcile throws.
    expect(drainPendingStripeCancellations).toHaveBeenCalledTimes(1);
  });

  it('still drains pending cancellations when all-pages reconciliation throws (BUG-262)', async () => {
    reconcileAllStripeSubscriptionPages.mockRejectedValueOnce(
      new Error('boom'),
    );
    drainPendingStripeCancellations.mockResolvedValueOnce({
      scanned: 1,
      drained: 1,
      failed: 0,
      failures: [],
      dryRun: false,
    });

    const response = await POST(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-secret',
        },
      }),
    );

    // The deleted-account cancellation drain MUST run despite the reconcile failure.
    expect(drainPendingStripeCancellations).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal error',
      reconciliationFailed: true,
      drainFailed: false,
    });
  });

  it('returns 500 and still runs reconcile when only the drain throws', async () => {
    drainPendingStripeCancellations.mockRejectedValueOnce(new Error('boom'));

    const response = await POST(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-secret',
        },
      }),
    );

    expect(reconcileAllStripeSubscriptionPages).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal error',
      reconciliationFailed: false,
      drainFailed: true,
    });
    expect(container.logger.error).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when the drain reports partial cancellation failures (failed > 0)', async () => {
    drainPendingStripeCancellations.mockResolvedValueOnce({
      scanned: 2,
      drained: 1,
      failed: 1,
      failures: [{ eventId: 'evt_failed', error: 'cancel failed' }],
      dryRun: false,
    });

    const response = await POST(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-secret',
        },
      }),
    );

    // The drain returns a `failed` count instead of throwing, so a partial
    // drain failure must still mark the run failed (BUG-262 / CodeRabbit).
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal error',
      reconciliationFailed: false,
      drainFailed: true,
    });
    expect(reconcileAllStripeSubscriptionPages).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when single-page reconciliation throws', async () => {
    reconcileStripeSubscriptions.mockRejectedValueOnce(new Error('boom'));

    const response = await POST(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?offset=0',
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-secret',
          },
        },
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal error',
      reconciliationFailed: true,
      drainFailed: false,
    });
    expect(container.logger.error).toHaveBeenCalledTimes(1);
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
    // BUG-262: the drain must still run when single-page reconcile throws.
    expect(drainPendingStripeCancellations).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/cron/reconcile-stripe-subscriptions', () => {
  let container: CronContainer;

  beforeEach(() => {
    vi.clearAllMocks();

    reconcileStripeSubscriptions.mockResolvedValue({
      scanned: 0,
      updated: 0,
      failed: 0,
      failures: [],
    });
    reconcileAllStripeSubscriptionPages.mockResolvedValue({
      scanned: 0,
      updated: 0,
      failed: 0,
      failures: [],
      pagesScanned: 1,
      stoppedEarly: false,
      nextOffset: null,
    });
    drainPendingStripeCancellations.mockResolvedValue({
      scanned: 0,
      drained: 0,
      failed: 0,
      failures: [],
      dryRun: true,
    });

    container = createMockContainer();
    createContainer.mockReturnValue(container);
  });

  it('returns 401 before container work when authorization header is missing', async () => {
    const response = await GET(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'GET',
      }),
    );

    expect(response.status).toBe(401);
    expect(container.createRateLimiter).toBeDefined();
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
    expect(
      container.db.query.stripeSubscriptions.findMany,
    ).not.toHaveBeenCalled();
  });

  it('returns 401 before reconciliation when bearer token is invalid', async () => {
    const response = await GET(
      new Request('http://localhost/api/cron/reconcile-stripe-subscriptions', {
        method: 'GET',
        headers: {
          authorization: 'Bearer wrong-secret',
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(reconcileStripeSubscriptions).not.toHaveBeenCalled();
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
    expect(
      container.db.query.stripeSubscriptions.findMany,
    ).not.toHaveBeenCalled();
  });

  it('runs the same reconciliation path as POST when the bearer token is valid', async () => {
    const response = await GET(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?limit=12&offset=7&dryRun=true',
        {
          method: 'GET',
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
        dryRun: true,
      },
      expect.any(Object),
    );
    expect(reconcileAllStripeSubscriptionPages).not.toHaveBeenCalled();
  });

  it('drains pending Stripe cancellations through the same authenticated GET run', async () => {
    container.stripe = {
      subscriptions: { list: async function* () {}, cancel: vi.fn() },
    };
    const response = await GET(
      new Request(
        'http://localhost/api/cron/reconcile-stripe-subscriptions?dryRun=false',
        {
          method: 'GET',
          headers: {
            authorization: 'Bearer test-secret',
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(reconcileAllStripeSubscriptionPages).toHaveBeenCalledWith(
      {
        limit: 100,
        dryRun: false,
      },
      expect.any(Object),
    );
    expect(drainPendingStripeCancellations).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: false,
      }),
      expect.objectContaining({
        pendingStripeCancellations: expect.any(Object),
        logger: container.logger,
      }),
    );
    await expect(
      drainPendingStripeCancellations.mock.calls[0]?.[1].cancelStripeCustomerSubscriptions(
        'cus_123',
      ),
    ).resolves.toBeUndefined();
  });
});
