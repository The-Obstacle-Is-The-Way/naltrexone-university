import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createContainer } from '@/lib/container';
import { deleteStripeCustomer } from '@/src/adapters/gateways/stripe-customer-deleter';
import {
  drainPendingStripeCustomerCleanups,
  PENDING_STRIPE_CUSTOMER_CLEANUP_STALE_AFTER_MINUTES,
} from '@/src/adapters/jobs/drain-pending-stripe-customer-cleanups';
import { reconcileAllStripeSubscriptionPages } from '@/src/adapters/jobs/reconcile-all-stripe-subscription-pages';
import {
  RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_CONCURRENCY,
  RECONCILE_STRIPE_SUBSCRIPTIONS_DEFAULT_LIMIT,
  RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT,
  reconcileStripeSubscriptions,
} from '@/src/adapters/jobs/reconcile-stripe-subscriptions';
import type { ReconcileStripeSubscriptionsDeps } from '@/src/adapters/jobs/reconcile-stripe-subscriptions-types';
import {
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE,
  HTTP_TOO_MANY_REQUESTS,
  HTTP_UNAUTHORIZED,
} from '@/src/adapters/shared/http-status';
import { CRON_RECONCILE_STRIPE_SUBSCRIPTIONS_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';

export const maxDuration = 60;

const ROUTE = '/api/cron/reconcile-stripe-subscriptions';

type AuthorizationTokenResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason: 'missing_authorization_header' | 'malformed_authorization_header';
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

async function handleCronRequest(req: Request): Promise<NextResponse> {
  const container = createContainer();

  const tokenResult = getAuthorizationToken(req);
  if (!tokenResult.ok) {
    container.logger.warn(
      {
        route: ROUTE,
        reason: tokenResult.reason,
      },
      'Unauthorized cron request',
    );
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: HTTP_UNAUTHORIZED },
    );
  }

  const cronSecret = container.env.CRON_SECRET ?? null;
  if (!cronSecret) {
    container.logger.error({ route: ROUTE }, 'CRON_SECRET is not configured');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: HTTP_UNAUTHORIZED },
    );
  }

  if (!isValidCronToken(tokenResult.token, cronSecret)) {
    container.logger.warn(
      {
        route: ROUTE,
        reason: 'invalid_token',
      },
      'Unauthorized cron request',
    );
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: HTTP_UNAUTHORIZED },
    );
  }

  try {
    const rate = await container.createRateLimiter().limit({
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
    container.logger.error(
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
    | Awaited<ReturnType<typeof reconcileStripeSubscriptions>>
    | Awaited<ReturnType<typeof reconcileAllStripeSubscriptionPages>>
    | null = null;
  let reconciliationFailed = false;
  try {
    const reconciliationDeps: ReconcileStripeSubscriptionsDeps = {
      stripe: container.stripe,
      priceIds: {
        monthly: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY,
        annual: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
      },
      logger: container.logger,
      now: container.now,
      webhookE2EOwner: container.env.STRIPE_WEBHOOK_E2E_OWNER,
      listLocalSubscriptions: async ({ limit, offset }) => {
        const rows = await container.db.query.stripeSubscriptions.findMany({
          columns: {
            userId: true,
            stripeSubscriptionId: true,
            version: true,
          },
          orderBy: (subs, { asc }) => [asc(subs.userId)],
          limit,
          offset,
        });

        return rows.map((row) => ({
          userId: row.userId,
          stripeSubscriptionId: row.stripeSubscriptionId,
          version: row.version,
        }));
      },
      transaction: async (fn) =>
        container.db.transaction(async (tx) =>
          fn({
            stripeCustomers: container.createStripeCustomerRepository(tx),
            subscriptions: container.createSubscriptionRepository(tx),
            renewalConsentRecords:
              container.createRenewalConsentRecordRepository(tx),
          }),
        ),
    };
    const singlePageInput =
      concurrency === null
        ? { limit, offset, dryRun }
        : { limit, offset, dryRun, concurrency };
    const allPagesInput =
      concurrency === null ? { limit, dryRun } : { limit, dryRun, concurrency };

    result =
      reconciliationScope === 'page'
        ? await reconcileStripeSubscriptions(
            singlePageInput,
            reconciliationDeps,
          )
        : await reconcileAllStripeSubscriptionPages(allPagesInput, {
            reconcilePage: (pageInput) =>
              reconcileStripeSubscriptions(pageInput, reconciliationDeps),
            logger: container.logger,
            now: Date.now,
          });
  } catch (error) {
    reconciliationFailed = true;
    container.logger.error(
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
  let pendingStripeCustomerCleanups: Awaited<
    ReturnType<typeof drainPendingStripeCustomerCleanups>
  > | null = null;
  let drainFailed = false;
  try {
    pendingStripeCustomerCleanups = await drainPendingStripeCustomerCleanups(
      {
        olderThan: pendingCustomerCleanupOlderThan,
        dryRun,
      },
      {
        pendingStripeCustomerCleanups:
          container.createPendingStripeCustomerCleanupRepository(),
        completePendingStripeCustomerCleanup: (eventId) =>
          container.db.transaction(async (tx) => {
            await container
              .createPendingStripeCustomerCleanupRepository(tx)
              .deleteByEventId(eventId);
            await container
              .createClerkEventRepository(tx)
              .markProcessed(eventId);
          }),
        deleteStripeCustomer: (stripeCustomerId) =>
          deleteStripeCustomer(
            container.stripe,
            container.logger,
            stripeCustomerId,
          ),
        logger: container.logger,
      },
    );
    // The drain converts per-row cleanup errors into a `failed` count rather
    // than throwing, so a Customer that was not deleted still fails the run.
    drainFailed = pendingStripeCustomerCleanups.failed > 0;
  } catch (error) {
    drainFailed = true;
    container.logger.error(
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

export async function GET(req: Request) {
  return handleCronRequest(req);
}

export async function POST(req: Request) {
  return handleCronRequest(req);
}
