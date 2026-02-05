import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createContainer } from '@/lib/container';
import { reconcileStripeSubscriptions } from '@/src/adapters/jobs/reconcile-stripe-subscriptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 1000;

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

  const url = new URL(req.url);
  const limit = Math.min(
    parseNonNegativeInt(url.searchParams.get('limit'), 100),
    MAX_LIMIT,
  );
  const offset = parseNonNegativeInt(url.searchParams.get('offset'), 0);

  let result: unknown;
  try {
    result = await reconcileStripeSubscriptions(
      { limit, offset },
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
