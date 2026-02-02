import { NextResponse } from 'next/server';
import type {
  ClerkWebhookDeps,
  ClerkWebhookEvent,
} from '@/src/adapters/controllers/clerk-webhook-controller';
import { CLERK_WEBHOOK_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import { isApplicationError } from '@/src/application/errors';
import type { RateLimiter } from '@/src/application/ports/gateways';
import type {
  StripeCustomerRepository,
  UserRepository,
} from '@/src/application/ports/repositories';

type StripeClient = {
  subscriptions: {
    list: (params: {
      customer: string;
      status: 'all';
      limit?: number;
    }) => AsyncIterable<{ id: string; status: string }>;
    cancel: (
      subscriptionId: string,
      options?: { idempotencyKey?: string },
    ) => Promise<unknown>;
  };
};

type ClerkWebhookRouteLogger = {
  error: (context: unknown, message: string) => void;
};

export type ClerkWebhookRouteContainer = {
  logger: ClerkWebhookRouteLogger;
  stripe: StripeClient;
  createRateLimiter: () => RateLimiter;
  createUserRepository: () => UserRepository;
  createStripeCustomerRepository: () => StripeCustomerRepository;
};

type VerifyWebhookFn = (req: Request) => Promise<ClerkWebhookEvent>;
type CancelStripeCustomerSubscriptionsFn = (
  stripe: StripeClient,
  stripeCustomerId: string,
) => Promise<void>;

export function createWebhookHandler(
  createContainer: () => ClerkWebhookRouteContainer,
  verifyWebhook: VerifyWebhookFn,
  processClerkWebhook: (
    deps: ClerkWebhookDeps,
    event: ClerkWebhookEvent,
  ) => Promise<void>,
  cancelStripeCustomerSubscriptions: CancelStripeCustomerSubscriptionsFn,
) {
  return async function POST(req: Request) {
    const container = createContainer();

    try {
      const forwardedFor = req.headers.get('x-forwarded-for');
      const ip = forwardedFor?.split(',')[0]?.trim() ?? 'unknown';

      const rate = await container.createRateLimiter().limit({
        key: `webhook:clerk:${ip}`,
        ...CLERK_WEBHOOK_RATE_LIMIT,
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
      container.logger.error({ error }, 'Clerk webhook rate limiter failed');
    }

    let event: ClerkWebhookEvent;
    try {
      event = await verifyWebhook(req);
    } catch (_error) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 400 },
      );
    }

    try {
      await processClerkWebhook(
        {
          userRepository: container.createUserRepository(),
          stripeCustomerRepository: container.createStripeCustomerRepository(),
          cancelStripeCustomerSubscriptions:
            cancelStripeCustomerSubscriptions.bind(null, container.stripe),
        },
        event,
      );

      return NextResponse.json({ received: true }, { status: 200 });
    } catch (error) {
      if (
        isApplicationError(error) &&
        error.code === 'INVALID_WEBHOOK_PAYLOAD'
      ) {
        container.logger.error({ error }, 'Clerk webhook payload invalid');
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      container.logger.error({ error }, 'Clerk webhook failed');
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500 },
      );
    }
  };
}
