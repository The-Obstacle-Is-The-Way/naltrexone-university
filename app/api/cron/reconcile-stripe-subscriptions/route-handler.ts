import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  type DrainPendingStripeCustomerCleanupsOutput,
  PENDING_STRIPE_CUSTOMER_CLEANUP_STALE_AFTER_MINUTES,
} from '@/src/adapters/jobs/drain-pending-stripe-customer-cleanups';
import type {
  ReconcileAllStripeSubscriptionPagesInput,
  ReconcileAllStripeSubscriptionPagesOutput,
} from '@/src/adapters/jobs/reconcile-all-stripe-subscription-pages';
import {
  RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY,
  RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_LIMIT,
  RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT,
} from '@/src/adapters/jobs/reconcile-stripe-subscriptions';
import type {
  ReconcileStripeSubscriptionsInput,
  ReconcileStripeSubscriptionsOutput,
} from '@/src/adapters/jobs/reconcile-stripe-subscriptions-types';
import { validateHeaderSecret } from '@/src/adapters/shared/header-secret';
import {
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE,
  HTTP_TOO_MANY_REQUESTS,
  HTTP_UNAUTHORIZED,
} from '@/src/adapters/shared/http-status';
import { CRON_RECONCILE_STRIPE_SUBSCRIPTIONS_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import type { Logger, RateLimiter } from '@/src/application/ports';

const ROUTE = '/api/cron/reconcile-stripe-subscriptions';

type AuthorizationTokenResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason: 'missing_authorization_header' | 'malformed_authorization_header';
    };

export type DrainPendingStripeCustomerCleanupsRequest = {
  olderThan: Date;
  dryRun: boolean;
};

/**
 * Narrow, client-owned seam for the cron route's orchestration. The route
 * module composes these from the container; the handler only owns
 * authorization, rate limiting, query parsing, scope routing, the BUG-262
 * independent drain, and status mapping.
 */
export type ReconcileStripeSubscriptionsCronHandlerDependencies = {
  cronSecret: string | undefined;
  logger: Pick<Logger, 'warn' | 'error'>;
  createRateLimiter: () => RateLimiter;
  reconcilePage: (
    input: ReconcileStripeSubscriptionsInput,
  ) => Promise<ReconcileStripeSubscriptionsOutput>;
  reconcileAllPages: (
    input: ReconcileAllStripeSubscriptionPagesInput,
  ) => Promise<ReconcileAllStripeSubscriptionPagesOutput>;
  drainPendingStripeCustomerCleanups: (
    input: DrainPendingStripeCustomerCleanupsRequest,
  ) => Promise<DrainPendingStripeCustomerCleanupsOutput>;
};

function getAuthorizationToken(req: Request): AuthorizationTokenResult {
  const header = req.headers.get('authorization');
  if (!header) {
    return { ok: false, reason: 'missing_authorization_header' };
  }
  const [scheme, token] = header.split(' ', 2);
  if (scheme !== 'Bearer' || !token) {
    return { ok: false, reason: 'malformed_authorization_header' };
  }
  return { ok: true, token };
}

function isValidCronToken(token: string, secret: string): boolean {
  const tokenHash = createHash('sha256').update(token).digest();
  const secretHash = createHash('sha256').update(secret).digest();
  return timingSafeEqual(tokenHash, secretHash);
}

function parseNonNegativeInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (!Number.isInteger(n)) return fallback;
  if (n < 0) return fallback;
  return n;
}

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return fallback;
}

function getReconciliationScope(url: URL): 'all' | 'page' {
  const scope = url.searchParams.get('scope');
  if (scope === 'all' || scope === 'page') return scope;
  if (url.searchParams.has('offset')) return 'page';
  return 'all';
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: HTTP_UNAUTHORIZED },
  );
}

async function handleCronRequest(
  req: Request,
  deps: ReconcileStripeSubscriptionsCronHandlerDependencies,
): Promise<NextResponse> {
  const tokenResult = getAuthorizationToken(req);
  if (!tokenResult.ok) {
    deps.logger.warn(
      { route: ROUTE, reason: tokenResult.reason },
      'Unauthorized cron request',
    );
    return unauthorized();
  }

  const cronSecret = deps.cronSecret ?? null;
  if (!cronSecret) {
    deps.logger.error({ route: ROUTE }, 'CRON_SECRET is not configured');
    return unauthorized();
  }

  if (!validateHeaderSecret('CRON_SECRET', cronSecret).ok) {
    deps.logger.error({ route: ROUTE }, 'CRON_SECRET is not header-safe');
    return unauthorized();
  }

  if (!isValidCronToken(tokenResult.token, cronSecret)) {
    deps.logger.warn(
      { route: ROUTE, reason: 'invalid_token' },
      'Unauthorized cron request',
    );
    return unauthorized();
  }

  try {
    const rate = await deps.createRateLimiter().limit({
      key: 'cron:reconcile-stripe-subscriptions',
      ...CRON_RECONCILE_STRIPE_SUBSCRIPTIONS_RATE_LIMIT,
    });

    if (!rate.success) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: HTTP_TOO_MANY_REQUESTS,
          headers: {
            'Retry-After': String(rate.retryAfterSeconds),
            'X-RateLimit-Limit': String(rate.limit),
            'X-RateLimit-Remaining': String(rate.remaining),
          },
        },
      );
    }
  } catch (error) {
    deps.logger.error(
      {
        route: ROUTE,
        error: error instanceof Error ? error.message : String(error),
      },
      'Cron reconciliation rate limiter failed',
    );
    return NextResponse.json(
      { error: 'Rate limiter unavailable' },
      { status: HTTP_SERVICE_UNAVAILABLE },
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(
    parseNonNegativeInt(
      url.searchParams.get('limit'),
      RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_LIMIT,
    ),
    RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT,
  );
  const offset = parseNonNegativeInt(url.searchParams.get('offset'), 0);
  const dryRun = parseBoolean(url.searchParams.get('dryRun'), true);
  const pendingCustomerCleanupStaleMinutes = parseNonNegativeInt(
    url.searchParams.get('pendingCustomerCleanupStaleMinutes'),
    PENDING_STRIPE_CUSTOMER_CLEANUP_STALE_AFTER_MINUTES,
  );
  const pendingCustomerCleanupOlderThan = new Date(
    Date.now() - pendingCustomerCleanupStaleMinutes * 60 * 1000,
  );
  const concurrencyParam = url.searchParams.get('concurrency');
  const concurrency =
    concurrencyParam !== null
      ? Math.max(
          1,
          parseNonNegativeInt(
            concurrencyParam,
            RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY,
          ),
        )
      : null;
  const reconciliationScope = getReconciliationScope(url);

  let result:
    | ReconcileStripeSubscriptionsOutput
    | ReconcileAllStripeSubscriptionPagesOutput
    | null = null;
  let reconciliationFailed = false;
  try {
    const singlePageInput =
      concurrency === null
        ? { limit, offset, dryRun }
        : { limit, offset, dryRun, concurrency };
    const allPagesInput =
      concurrency === null ? { limit, dryRun } : { limit, dryRun, concurrency };

    result =
      reconciliationScope === 'page'
        ? await deps.reconcilePage(singlePageInput)
        : await deps.reconcileAllPages(allPagesInput);
  } catch (error) {
    reconciliationFailed = true;
    deps.logger.error(
      {
        route: ROUTE,
        task: 'reconcile',
        error: error instanceof Error ? error.message : String(error),
      },
      'Stripe subscription reconciliation failed',
    );
  }

  // BUG-262: run the deleted-account customer-cleanup drain independently of the
  // reconcile result. The two are unrelated maintenance tasks; a reconcile
  // failure (e.g. a first-page Stripe outage) must not skip the drain — that is
  // the durable safety net for failed post-deletion cleanup (BUG-246/BUG-288).
  let pendingStripeCustomerCleanups: DrainPendingStripeCustomerCleanupsOutput | null =
    null;
  let drainFailed = false;
  try {
    pendingStripeCustomerCleanups =
      await deps.drainPendingStripeCustomerCleanups({
        olderThan: pendingCustomerCleanupOlderThan,
        dryRun,
      });
    // The drain converts per-row cleanup errors into a `failed` count rather
    // than throwing, so a Customer that was not deleted still fails the run.
    drainFailed = pendingStripeCustomerCleanups.failed > 0;
  } catch (error) {
    drainFailed = true;
    deps.logger.error(
      {
        route: ROUTE,
        task: 'drain',
        error: error instanceof Error ? error.message : String(error),
      },
      'Pending Stripe customer cleanup drain failed',
    );
  }

  if (reconciliationFailed || drainFailed) {
    return NextResponse.json(
      { error: 'Internal error', reconciliationFailed, drainFailed },
      { status: HTTP_INTERNAL_SERVER_ERROR },
    );
  }

  return NextResponse.json(
    { ...result, pendingStripeCustomerCleanups },
    { status: HTTP_OK },
  );
}

export function createReconcileStripeSubscriptionsCronRouteHandler(
  resolveDependencies: () => ReconcileStripeSubscriptionsCronHandlerDependencies,
): (req: Request) => Promise<NextResponse> {
  return (req) => handleCronRequest(req, resolveDependencies());
}
