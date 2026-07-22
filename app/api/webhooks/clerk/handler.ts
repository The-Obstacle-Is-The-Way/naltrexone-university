import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import type {
  ClerkWebhookDeps,
  ClerkWebhookEvent,
  ClerkWebhookTransaction,
} from '@/src/adapters/controllers/clerk-webhook-controller';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE,
  HTTP_TOO_MANY_REQUESTS,
} from '@/src/adapters/shared/http-status';
import { CLERK_WEBHOOK_RATE_LIMIT } from '@/src/adapters/shared/rate-limits';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import { isApplicationError } from '@/src/application/errors';
import type { RateLimiter } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';

type StripeClient = {
  customers: {
    del: (stripeCustomerId: string) => Promise<unknown>;
  };
};

export type ClerkWebhookRouteContainer = {
  logger: Logger;
  stripe: StripeClient;
  createRateLimiter: () => RateLimiter;
  getClerkUserById: ClerkWebhookDeps['getClerkUserById'];
  transaction: <T>(
    fn: (tx: ClerkWebhookTransaction) => Promise<T>,
  ) => Promise<T>;
};

type VerifyWebhookFn = (req: Request) => Promise<ClerkWebhookEvent>;
type DeleteStripeCustomerFn = (
  stripe: StripeClient,
  logger: Logger,
  stripeCustomerId: string,
) => Promise<void>;

export function createWebhookHandler(
  createContainer: () => ClerkWebhookRouteContainer,
  verifyWebhook: VerifyWebhookFn,
  processClerkWebhook: (
    deps: ClerkWebhookDeps,
    event: ClerkWebhookEvent,
  ) => Promise<void>,
  deleteStripeCustomer: DeleteStripeCustomerFn,
) {
  return async function POST(req: Request) {
    const container = createContainer();

    try {
      const ip = getClientIp(req.headers);

      const rate = await container.createRateLimiter().limit({
        key: `webhook:clerk:${ip}`,
        ...CLERK_WEBHOOK_RATE_LIMIT,
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
        'Clerk webhook rate limiter failed',
      );
      return NextResponse.json(
        { error: 'Rate limiter unavailable' },
        { status: HTTP_SERVICE_UNAVAILABLE },
      );
    }

    let event: ClerkWebhookEvent;
    try {
      event = await verifyWebhook(req);
    } catch (error) {
      container.logger.error(
        {
          route: '/api/webhooks/clerk',
          error: projectSafeErrorDiagnostics(error),
        },
        'Clerk webhook signature verification failed',
      );
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: HTTP_BAD_REQUEST },
      );
    }

    try {
      await processClerkWebhook(
        {
          transaction: container.transaction,
          deleteStripeCustomer: deleteStripeCustomer.bind(
            null,
            container.stripe,
            container.logger,
          ),
          getClerkUserById: container.getClerkUserById,
          logger: container.logger,
        },
        event,
      );

      return NextResponse.json({ received: true }, { status: HTTP_OK });
    } catch (error) {
      if (
        isApplicationError(error) &&
        error.code === 'INVALID_WEBHOOK_PAYLOAD'
      ) {
        container.logger.error(
          { error: projectSafeErrorDiagnostics(error) },
          'Clerk webhook payload invalid',
        );
        return NextResponse.json(
          { error: 'Webhook validation failed' },
          { status: HTTP_BAD_REQUEST },
        );
      }

      container.logger.error(
        { error: projectSafeErrorDiagnostics(error) },
        'Clerk webhook failed',
      );
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: HTTP_INTERNAL_SERVER_ERROR },
      );
    }
  };
}
