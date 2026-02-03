import { NextResponse } from 'next/server';
import type {
  StripeWebhookDeps,
  StripeWebhookInput,
} from '@/src/adapters/controllers/stripe-webhook-controller';
import { STRIPE_WEBHOOK_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
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
        { status: 400 },
      );
    }

    const container = createContainer();

    try {
      const forwardedFor = req.headers.get('x-forwarded-for');
      const ip = forwardedFor?.split(',')[0]?.trim() ?? 'unknown';

      const rate = await container.createRateLimiter().limit({
        key: `webhook:stripe:${ip}`,
        ...STRIPE_WEBHOOK_RATE_LIMIT,
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
      container.logger.error({ error }, 'Stripe webhook rate limiter failed');
      return NextResponse.json(
        { error: 'Rate limiter unavailable' },
        { status: 503 },
      );
    }

    const rawBody = await req.text();

    try {
      await processStripeWebhook(container.createStripeWebhookDeps(), {
        rawBody,
        signature,
      });

      return NextResponse.json({ received: true }, { status: 200 });
    } catch (error) {
      if (
        isApplicationError(error) &&
        (error.code === 'INVALID_WEBHOOK_SIGNATURE' ||
          error.code === 'INVALID_WEBHOOK_PAYLOAD')
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      container.logger.error({ error }, 'Stripe webhook failed');
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500 },
      );
    }
  };
}
