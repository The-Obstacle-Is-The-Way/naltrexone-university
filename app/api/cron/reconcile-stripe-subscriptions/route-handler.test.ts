import { describe, expect, it } from 'vitest';
import type { DrainPendingStripeCustomerCleanupsOutput } from '@/src/adapters/jobs/drain-pending-stripe-customer-cleanups';
import type {
  ReconcileAllStripeSubscriptionPagesInput,
  ReconcileAllStripeSubscriptionPagesOutput,
} from '@/src/adapters/jobs/reconcile-all-stripe-subscription-pages';
import {
  RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY,
  RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT,
} from '@/src/adapters/jobs/reconcile-stripe-subscriptions';
import type {
  ReconcileStripeSubscriptionsInput,
  ReconcileStripeSubscriptionsOutput,
} from '@/src/adapters/jobs/reconcile-stripe-subscriptions-types';
import {
  FakeLogger,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
import {
  createReconcileStripeSubscriptionsCronRouteHandler,
  type DrainPendingStripeCustomerCleanupsRequest,
  type ReconcileStripeSubscriptionsCronHandlerDependencies,
} from './route-handler';

const ROUTE_URL = 'http://localhost/api/cron/reconcile-stripe-subscriptions';
const ROUTE = '/api/cron/reconcile-stripe-subscriptions';

const pageResult: ReconcileStripeSubscriptionsOutput = {
  scanned: 0,
  updated: 0,
  failed: 0,
  failures: [],
};

const allPagesResult: ReconcileAllStripeSubscriptionPagesOutput = {
  ...pageResult,
  pagesScanned: 1,
  stoppedEarly: false,
  nextOffset: null,
};

const drainResult: DrainPendingStripeCustomerCleanupsOutput = {
  scanned: 0,
  drained: 0,
  failed: 0,
  failures: [],
  hasMore: false,
  dryRun: true,
};

function createHarness(input?: {
  omitCronSecret?: boolean;
  cronSecret?: string;
  rateLimiter?: FakeRateLimiter;
  pageResult?: ReconcileStripeSubscriptionsOutput;
  pageError?: Error;
  allPagesResult?: ReconcileAllStripeSubscriptionPagesOutput;
  allPagesError?: Error;
  drainResult?: DrainPendingStripeCustomerCleanupsOutput;
  drainError?: Error;
}) {
  const logger = new FakeLogger();
  const rateLimiter = input?.rateLimiter ?? new FakeRateLimiter();
  const pageCalls: ReconcileStripeSubscriptionsInput[] = [];
  const allPagesCalls: ReconcileAllStripeSubscriptionPagesInput[] = [];
  const drainCalls: DrainPendingStripeCustomerCleanupsRequest[] = [];
  const dependencies: ReconcileStripeSubscriptionsCronHandlerDependencies = {
    cronSecret: input?.omitCronSecret
      ? undefined
      : (input?.cronSecret ?? 'test-secret'),
    logger,
    createRateLimiter: () => rateLimiter,
    reconcilePage: async (pageInput) => {
      pageCalls.push(pageInput);
      if (input?.pageError) throw input.pageError;
      return input?.pageResult ?? pageResult;
    },
    reconcileAllPages: async (allPagesInput) => {
      allPagesCalls.push(allPagesInput);
      if (input?.allPagesError) throw input.allPagesError;
      return input?.allPagesResult ?? allPagesResult;
    },
    drainPendingStripeCustomerCleanups: async (drainInput) => {
      drainCalls.push(drainInput);
      if (input?.drainError) throw input.drainError;
      return input?.drainResult ?? drainResult;
    },
  };
  return {
    handle: createReconcileStripeSubscriptionsCronRouteHandler(
      () => dependencies,
    ),
    logger,
    rateLimiter,
    pageCalls,
    allPagesCalls,
    drainCalls,
  };
}

function request(input?: {
  query?: string;
  method?: 'GET' | 'POST';
  authorization?: string | null;
}): Request {
  const headers: Record<string, string> = {};
  const authorization =
    input?.authorization === undefined
      ? 'Bearer test-secret'
      : input.authorization;
  if (authorization !== null) headers.authorization = authorization;
  return new Request(`${ROUTE_URL}${input?.query ?? ''}`, {
    method: input?.method ?? 'POST',
    headers,
  });
}

describe('POST /api/cron/reconcile-stripe-subscriptions', () => {
  it('clamps request limit to MAX_LIMIT before calling all-pages reconciliation', async () => {
    const harness = createHarness();

    const response = await harness.handle(request({ query: '?limit=750' }));

    expect(response.status).toBe(200);
    expect(harness.allPagesCalls).toEqual([
      { limit: RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT, dryRun: true },
    ]);
    expect(harness.pageCalls).toEqual([]);
  });

  it('runs all-pages mode by default and surfaces coverage fields in the response', async () => {
    const harness = createHarness({
      allPagesResult: {
        scanned: 125,
        updated: 124,
        failed: 1,
        failures: [{ stripeSubscriptionId: 'sub_failed', error: 'row failed' }],
        pagesScanned: 2,
        stoppedEarly: false,
        nextOffset: null,
      },
      drainResult: {
        scanned: 1,
        drained: 1,
        failed: 0,
        failures: [],
        hasMore: false,
        dryRun: false,
      },
    });

    const response = await harness.handle(request({ query: '?dryRun=false' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      scanned: 125,
      updated: 124,
      failed: 1,
      failures: [{ stripeSubscriptionId: 'sub_failed', error: 'row failed' }],
      pagesScanned: 2,
      stoppedEarly: false,
      nextOffset: null,
      pendingStripeCustomerCleanups: {
        scanned: 1,
        drained: 1,
        failed: 0,
        failures: [],
        hasMore: false,
        dryRun: false,
      },
    });
    expect(harness.allPagesCalls).toEqual([{ limit: 100, dryRun: false }]);
    expect(harness.pageCalls).toEqual([]);
  });

  it('uses all-pages mode when scope=all even if offset is present', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      request({
        query: '?scope=all&limit=12&offset=7&dryRun=false&concurrency=3',
      }),
    );

    expect(response.status).toBe(200);
    expect(harness.allPagesCalls).toEqual([
      { limit: 12, dryRun: false, concurrency: 3 },
    ]);
    expect(harness.pageCalls).toEqual([]);
  });

  it('uses single-page mode when scope=page is explicit', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      request({ query: '?scope=page&limit=12&dryRun=false&concurrency=3' }),
    );

    expect(response.status).toBe(200);
    expect(harness.pageCalls).toEqual([
      { limit: 12, offset: 0, dryRun: false, concurrency: 3 },
    ]);
    expect(harness.allPagesCalls).toEqual([]);
  });

  it('returns 401 when authorization header is missing even when CRON_SECRET is not configured', async () => {
    const harness = createHarness({ omitCronSecret: true });

    const response = await harness.handle(request({ authorization: null }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(harness.pageCalls).toEqual([]);
    expect(harness.allPagesCalls).toEqual([]);
    expect(harness.logger.warnCalls).toEqual([
      {
        context: { route: ROUTE, reason: 'missing_authorization_header' },
        msg: 'Unauthorized cron request',
      },
    ]);
    expect(harness.logger.errorCalls).toEqual([]);
  });

  it('returns 401 without leaking config state when Bearer token is present but CRON_SECRET is not configured', async () => {
    const harness = createHarness({ omitCronSecret: true });

    const response = await harness.handle(
      request({ authorization: 'Bearer some-token' }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(harness.pageCalls).toEqual([]);
    expect(harness.allPagesCalls).toEqual([]);
    expect(harness.logger.warnCalls).toEqual([]);
    expect(harness.logger.errorCalls).toEqual([
      { context: { route: ROUTE }, msg: 'CRON_SECRET is not configured' },
    ]);
  });

  it.each([
    ['leading whitespace', ' secret'],
    ['trailing whitespace', 'secret '],
    ['internal whitespace', 'sec ret'],
    ['line feed', 'secret\n'],
    ['tab', 'sec\tret'],
    ['NUL', 'sec\0ret'],
    ['DEL', 'sec\u007fret'],
    ['non-ASCII', 'secretĀ'],
  ])(
    'fails closed with a value-free configuration error for %s',
    async (_label, secret) => {
      const harness = createHarness({ cronSecret: secret });

      const response = await harness.handle(request());

      expect(response.status).toBe(401);
      expect(harness.rateLimiter.inputs).toEqual([]);
      expect(harness.pageCalls).toEqual([]);
      expect(harness.allPagesCalls).toEqual([]);
      expect(harness.drainCalls).toEqual([]);
      expect(harness.logger.errorCalls).toEqual([
        { context: { route: ROUTE }, msg: 'CRON_SECRET is not header-safe' },
      ]);
    },
  );

  it('returns 401 when authorization header is missing', async () => {
    const harness = createHarness();

    const response = await harness.handle(request({ authorization: null }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(harness.pageCalls).toEqual([]);
    expect(harness.allPagesCalls).toEqual([]);
    expect(harness.logger.warnCalls).toContainEqual({
      context: { route: ROUTE, reason: 'missing_authorization_header' },
      msg: 'Unauthorized cron request',
    });
  });

  it('returns 401 when authorization header is malformed', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      request({ authorization: 'Basic abc123' }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(harness.pageCalls).toEqual([]);
    expect(harness.allPagesCalls).toEqual([]);
    expect(harness.logger.warnCalls).toContainEqual({
      context: { route: ROUTE, reason: 'malformed_authorization_header' },
      msg: 'Unauthorized cron request',
    });
  });

  it('returns 401 when bearer token is invalid', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      request({ authorization: 'Bearer wrong-secret' }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(harness.pageCalls).toEqual([]);
    expect(harness.allPagesCalls).toEqual([]);
    expect(harness.logger.warnCalls).toContainEqual({
      context: { route: ROUTE, reason: 'invalid_token' },
      msg: 'Unauthorized cron request',
    });
  });

  it('parses offset and dryRun query params before reconciliation', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      request({ query: '?limit=12&offset=7&dryRun=false' }),
    );

    expect(response.status).toBe(200);
    expect(harness.pageCalls).toEqual([
      { limit: 12, offset: 7, dryRun: false },
    ]);
    expect(harness.allPagesCalls).toEqual([]);
  });

  it('parses concurrency query param before reconciliation when provided', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      request({ query: '?limit=12&offset=7&dryRun=false&concurrency=3' }),
    );

    expect(response.status).toBe(200);
    expect(harness.pageCalls).toEqual([
      { limit: 12, offset: 7, dryRun: false, concurrency: 3 },
    ]);
    expect(harness.allPagesCalls).toEqual([]);
  });

  it('clamps concurrency=0 to 1', async () => {
    const harness = createHarness();

    const response = await harness.handle(request({ query: '?concurrency=0' }));

    expect(response.status).toBe(200);
    expect(harness.allPagesCalls).toEqual([
      expect.objectContaining({ concurrency: 1 }),
    ]);
    expect(harness.pageCalls).toEqual([]);
  });

  it('falls back concurrency=-1 to default then clamps', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      request({ query: '?concurrency=-1' }),
    );

    expect(response.status).toBe(200);
    expect(harness.allPagesCalls).toEqual([
      expect.objectContaining({
        concurrency: RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY,
      }),
    ]);
    expect(harness.pageCalls).toEqual([]);
  });

  it('falls back malformed concurrency to default', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      request({ query: '?concurrency=abc' }),
    );

    expect(response.status).toBe(200);
    expect(harness.allPagesCalls).toEqual([
      expect.objectContaining({
        concurrency: RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY,
      }),
    ]);
    expect(harness.pageCalls).toEqual([]);
  });

  it('returns 429 when rate limited', async () => {
    const harness = createHarness({
      rateLimiter: new FakeRateLimiter({
        success: false,
        limit: 5,
        remaining: 0,
        retryAfterSeconds: 42,
      }),
    });

    const response = await harness.handle(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: 'Too many requests',
    });
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(harness.rateLimiter.inputs).toEqual([
      {
        key: 'cron:reconcile-stripe-subscriptions',
        limit: 5,
        windowMs: 60_000,
      },
    ]);
    expect(harness.pageCalls).toEqual([]);
    expect(harness.allPagesCalls).toEqual([]);
  });

  it('returns 503 when the rate limiter fails', async () => {
    const harness = createHarness({
      rateLimiter: new FakeRateLimiter(new Error('rate limiter down')),
    });

    const response = await harness.handle(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Rate limiter unavailable',
    });
    expect(harness.pageCalls).toEqual([]);
    expect(harness.allPagesCalls).toEqual([]);
    expect(harness.logger.errorCalls).toHaveLength(1);
  });

  it('falls back to safe defaults when query params are malformed', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      request({ query: '?scope=unknown&limit=abc&offset=-1&dryRun=notbool' }),
    );

    expect(response.status).toBe(200);
    expect(harness.pageCalls).toEqual([
      { limit: 100, offset: 0, dryRun: true },
    ]);
    expect(harness.allPagesCalls).toEqual([]);
  });

  it('returns 500 when all-pages reconciliation throws before any page succeeds', async () => {
    const harness = createHarness({ allPagesError: new Error('boom') });

    const response = await harness.handle(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal error',
      reconciliationFailed: true,
      drainFailed: false,
    });
    expect(harness.logger.errorCalls).toHaveLength(1);
    expect(harness.pageCalls).toEqual([]);
    // BUG-262: the drain must still run when reconcile throws.
    expect(harness.drainCalls).toHaveLength(1);
  });

  it('still drains pending customer cleanups when all-pages reconciliation throws (BUG-262)', async () => {
    const harness = createHarness({
      allPagesError: new Error('boom'),
      drainResult: {
        scanned: 1,
        drained: 1,
        failed: 0,
        failures: [],
        hasMore: false,
        dryRun: false,
      },
    });

    const response = await harness.handle(request());

    // The deleted-account cleanup drain MUST run despite the reconcile failure.
    expect(harness.drainCalls).toHaveLength(1);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal error',
      reconciliationFailed: true,
      drainFailed: false,
    });
  });

  it('returns 500 and still runs reconcile when only the drain throws', async () => {
    const harness = createHarness({ drainError: new Error('boom') });

    const response = await harness.handle(request());

    expect(harness.allPagesCalls).toHaveLength(1);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal error',
      reconciliationFailed: false,
      drainFailed: true,
    });
    expect(harness.logger.errorCalls).toHaveLength(1);
  });

  it('returns 500 when the drain reports partial customer-cleanup failures (failed > 0)', async () => {
    const harness = createHarness({
      drainResult: {
        scanned: 2,
        drained: 1,
        failed: 1,
        failures: [{ eventId: 'evt_failed', error: 'cleanup failed' }],
        hasMore: false,
        dryRun: false,
      },
    });

    const response = await harness.handle(request());

    // The drain returns a `failed` count instead of throwing, so a partial
    // drain failure must still mark the run failed (BUG-262 / CodeRabbit).
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal error',
      reconciliationFailed: false,
      drainFailed: true,
    });
    expect(harness.allPagesCalls).toHaveLength(1);
  });

  it('returns 500 when single-page reconciliation throws', async () => {
    const harness = createHarness({ pageError: new Error('boom') });

    const response = await harness.handle(request({ query: '?offset=0' }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal error',
      reconciliationFailed: true,
      drainFailed: false,
    });
    expect(harness.logger.errorCalls).toHaveLength(1);
    expect(harness.allPagesCalls).toEqual([]);
    // BUG-262: the drain must still run when single-page reconcile throws.
    expect(harness.drainCalls).toHaveLength(1);
  });

  it('derives the pending-cleanup cutoff from the stale-minutes query param', async () => {
    const harness = createHarness();
    const before = Date.now();

    const response = await harness.handle(
      request({ query: '?pendingCustomerCleanupStaleMinutes=0&dryRun=false' }),
    );

    expect(response.status).toBe(200);
    expect(harness.drainCalls).toHaveLength(1);
    const [call] = harness.drainCalls;
    expect(call?.dryRun).toBe(false);
    expect(call?.olderThan.getTime()).toBeGreaterThanOrEqual(before);
    expect(call?.olderThan.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('GET /api/cron/reconcile-stripe-subscriptions', () => {
  it('returns 401 before container work when authorization header is missing', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      request({ method: 'GET', authorization: null }),
    );

    expect(response.status).toBe(401);
    expect(harness.rateLimiter.inputs).toEqual([]);
    expect(harness.pageCalls).toEqual([]);
    expect(harness.allPagesCalls).toEqual([]);
    expect(harness.drainCalls).toEqual([]);
  });

  it('returns 401 before reconciliation when bearer token is invalid', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      request({ method: 'GET', authorization: 'Bearer wrong-secret' }),
    );

    expect(response.status).toBe(401);
    expect(harness.pageCalls).toEqual([]);
    expect(harness.allPagesCalls).toEqual([]);
    expect(harness.drainCalls).toEqual([]);
  });

  it('runs the same reconciliation path as POST when the bearer token is valid', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      request({ method: 'GET', query: '?limit=12&offset=7&dryRun=true' }),
    );

    expect(response.status).toBe(200);
    expect(harness.pageCalls).toEqual([{ limit: 12, offset: 7, dryRun: true }]);
    expect(harness.allPagesCalls).toEqual([]);
  });

  it('drains pending Stripe customer cleanups through the same authenticated GET run', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      request({ method: 'GET', query: '?dryRun=false' }),
    );

    expect(response.status).toBe(200);
    expect(harness.allPagesCalls).toEqual([{ limit: 100, dryRun: false }]);
    expect(harness.drainCalls).toEqual([
      { olderThan: expect.any(Date), dryRun: false },
    ]);
  });
});
