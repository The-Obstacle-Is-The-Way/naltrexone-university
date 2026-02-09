import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createContainer } from '@/lib/container';
import {
  RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT,
  reconcileStripeSubscriptions,
} from '@/src/adapters/jobs/reconcile-stripe-subscriptions';
import { CRON_RECONCILE_STRIPE_SUBSCRIPTIONS_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAuthorizationToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ', 2);
  if (scheme !== 'Bearer' || !token) return null;
  return token;
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

export async function POST(req: Request) {
  const container = createContainer();

  const cronSecret = container.env.CRON_SECRET ?? null;
  if (!cronSecret) {
    container.logger.error(
      { route: '/api/cron/reconcile-stripe-subscriptions' },
      'CRON_SECRET is not configured',
    );
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured' },
      { status: 503 },
    );
  }

  const token = getAuthorizationToken(req);
  if (!token || !isValidCronToken(token, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
          status: 429,
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
        route: '/api/cron/reconcile-stripe-subscriptions',
        error: error instanceof Error ? error.message : String(error),
      },
      'Cron reconciliation rate limiter failed',
    );
    return NextResponse.json(
      { error: 'Rate limiter unavailable' },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(
    parseNonNegativeInt(url.searchParams.get('limit'), 100),
    RECONCILE_STRIPE_SUBSCRIPTIONS_MAX_LIMIT,
  );
  const offset = parseNonNegativeInt(url.searchParams.get('offset'), 0);
  const dryRun = parseBoolean(url.searchParams.get('dryRun'), true);

  let result: unknown;
  try {
    result = await reconcileStripeSubscriptions(
      { limit, offset, dryRun },
      {
        stripe: container.stripe,
        priceIds: {
          monthly: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY,
          annual: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
        },
        logger: container.logger,
        listLocalSubscriptions: async ({ limit, offset }) => {
          const rows = await container.db.query.stripeSubscriptions.findMany({
            columns: {
              userId: true,
              stripeSubscriptionId: true,
            },
            orderBy: (subs, { asc }) => [asc(subs.userId)],
            limit,
            offset,
          });

          return rows.map((row) => ({
            userId: row.userId,
            stripeSubscriptionId: row.stripeSubscriptionId,
          }));
        },
        transaction: async (fn) =>
          container.db.transaction(async (tx) =>
            fn({
              stripeCustomers: container.createStripeCustomerRepository(tx),
              subscriptions: container.createSubscriptionRepository(tx),
            }),
          ),
      },
    );
  } catch (error) {
    container.logger.error(
      {
        route: '/api/cron/reconcile-stripe-subscriptions',
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to reconcile Stripe subscriptions',
    );
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json(result, { status: 200 });
}
