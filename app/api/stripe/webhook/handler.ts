import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import type {
  StripeWebhookDeps,
  StripeWebhookInput,
} from '@/src/adapters/controllers/stripe-webhook-controller';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE,
  HTTP_TOO_MANY_REQUESTS,
} from '@/src/adapters/shared/http-status';
import { STRIPE_WEBHOOK_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import { isApplicationError } from '@/src/application/errors';
import type { RateLimiter } from '@/src/application/ports/gateways';

type StripeWebhookRouteLogger = {
  error: (context: unknown, message: string) => void;
};

export type StripeWebhookRouteContainer = {
  logger: StripeWebhookRouteLogger;
  createStripeWebhookDeps: () => StripeWebhookDeps;
  createRateLimiter: () => RateLimiter;
};

export function createWebhookHandler(
  createContainer: () => StripeWebhookRouteContainer,
  processStripeWebhook: (
    deps: StripeWebhookDeps,
    input: StripeWebhookInput,
  ) => Promise<void>,
) {
  return async function POST(req: Request) {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: HTTP_BAD_REQUEST },
      );
    }

    const container = createContainer();

    try {
      const ip = getClientIp(req.headers);

      const rate = await container.createRateLimiter().limit({
        key: `webhook:stripe:${ip}`,
        ...STRIPE_WEBHOOK_RATE_LIMIT,
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
        { error: projectSafeErrorDiagnostics(error) },
        'Stripe webhook rate limiter failed',
      );
      return NextResponse.json(
        { error: 'Rate limiter unavailable' },
        { status: HTTP_SERVICE_UNAVAILABLE },
      );
    }

    const rawBody = await req.text();

    try {
      await processStripeWebhook(container.createStripeWebhookDeps(), {
        rawBody,
        signature,
      });

      return NextResponse.json({ received: true }, { status: HTTP_OK });
    } catch (error) {
      if (
        isApplicationError(error) &&
        (error.code === 'INVALID_WEBHOOK_SIGNATURE' ||
          error.code === 'INVALID_WEBHOOK_PAYLOAD')
      ) {
        container.logger.error(
          { error: projectSafeErrorDiagnostics(error) },
          'Stripe webhook validation failed',
        );
        return NextResponse.json(
          { error: 'Webhook validation failed' },
          { status: HTTP_BAD_REQUEST },
        );
      }

      container.logger.error(
        { error: projectSafeErrorDiagnostics(error) },
        'Stripe webhook failed',
      );
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: HTTP_INTERNAL_SERVER_ERROR },
      );
    }
  };
}
