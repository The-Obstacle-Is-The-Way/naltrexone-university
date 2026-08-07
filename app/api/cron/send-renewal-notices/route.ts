import { createHash, timingSafeEqual } from 'node:crypto';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { stripeSubscriptions, users } from '@/db/schema';
import { createContainer } from '@/lib/container';
import { CANCELLATION_METHOD, PRICING_DATA } from '@/lib/pricing-data';
import {
  SEND_RENEWAL_NOTICES_DEFAULT_LIMIT,
  sendDueRenewalNotices,
} from '@/src/adapters/jobs/send-due-renewal-notices';
import {
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE,
  HTTP_TOO_MANY_REQUESTS,
  HTTP_UNAUTHORIZED,
} from '@/src/adapters/shared/http-status';
import { CRON_SEND_RENEWAL_NOTICES_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';

export const maxDuration = 60;

const ROUTE = '/api/cron/send-renewal-notices';

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

async function handleCronRequest(req: Request): Promise<NextResponse> {
  const container = createContainer();
  const authorization = getAuthorizationToken(req);
  if (!authorization.ok) {
    container.logger.warn(
      { route: ROUTE, reason: authorization.reason },
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
  if (!isValidCronToken(authorization.token, cronSecret)) {
    container.logger.warn(
      { route: ROUTE, reason: 'invalid_token' },
      'Unauthorized cron request',
    );
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: HTTP_UNAUTHORIZED },
    );
  }

  try {
    const rate = await container.createRateLimiter().limit({
      key: 'cron:send-renewal-notices',
      ...CRON_SEND_RENEWAL_NOTICES_RATE_LIMIT,
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
      { route: ROUTE, error: projectSafeErrorDiagnostics(error) },
      'Renewal notice cron rate limiter failed',
    );
    return NextResponse.json(
      { error: 'Rate limiter unavailable' },
      { status: HTTP_SERVICE_UNAVAILABLE },
    );
  }

  try {
    const result = await sendDueRenewalNotices(
      { limit: SEND_RENEWAL_NOTICES_DEFAULT_LIMIT },
      {
        now: container.now,
        annualPlan: {
          planName: PRICING_DATA.annual.name,
          amountCents: PRICING_DATA.annual.amountCents,
          currency: PRICING_DATA.annual.currency,
          frequency: PRICING_DATA.annual.frequency,
          disclosureVersion: PRICING_DATA.annual.disclosureVersion,
          cancellationMethod: CANCELLATION_METHOD,
        },
        sendDueRenewalNotices: container.createSendDueRenewalNoticesUseCase(),
        listAnnualSubscriptionsDue: async ({
          renewalAtOrAfter,
          renewalAtOrBefore,
          limit,
        }) =>
          container.db
            .select({
              externalSubscriptionId: stripeSubscriptions.stripeSubscriptionId,
              renewalAt: stripeSubscriptions.currentPeriodEnd,
              destination: users.email,
            })
            .from(stripeSubscriptions)
            .innerJoin(users, eq(users.id, stripeSubscriptions.userId))
            .where(
              and(
                eq(stripeSubscriptions.status, 'active'),
                eq(
                  stripeSubscriptions.priceId,
                  container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
                ),
                eq(stripeSubscriptions.cancelAtPeriodEnd, false),
                gte(stripeSubscriptions.currentPeriodEnd, renewalAtOrAfter),
                lte(stripeSubscriptions.currentPeriodEnd, renewalAtOrBefore),
              ),
            )
            .orderBy(asc(stripeSubscriptions.currentPeriodEnd))
            .limit(limit),
      },
    );
    return NextResponse.json(result, { status: HTTP_OK });
  } catch (error) {
    container.logger.error(
      { route: ROUTE, error: projectSafeErrorDiagnostics(error) },
      'Renewal notice cron failed',
    );
    return NextResponse.json(
      { error: 'Internal error' },
      { status: HTTP_INTERNAL_SERVER_ERROR },
    );
  }
}

export async function GET(req: Request) {
  return handleCronRequest(req);
}

export async function POST(req: Request) {
  return handleCronRequest(req);
}
