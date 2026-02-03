import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { createContainer } from '@/lib/container';
import type { ClerkWebhookEvent } from '@/src/adapters/controllers/clerk-webhook-controller';
import { processClerkWebhook } from '@/src/adapters/controllers/clerk-webhook-controller';
import { isTransientExternalError, retry } from '@/src/adapters/shared/retry';
import type { ClerkWebhookRouteContainer } from './handler';
import { createWebhookHandler } from './handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STRIPE_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 100,
  factor: 2,
  maxDelayMs: 1000,
} as const;

async function cancelStripeCustomerSubscriptions(
  stripe: ClerkWebhookRouteContainer['stripe'],
  stripeCustomerId: string,
): Promise<void> {
  await retry(
    async () => {
      for await (const subscription of stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'all',
        limit: 100,
      })) {
        if (
          subscription.status === 'canceled' ||
          subscription.status === 'incomplete_expired'
        ) {
          continue;
        }

        await retry(
          () =>
            stripe.subscriptions.cancel(subscription.id, {
              idempotencyKey: `cancel_subscription:${subscription.id}`,
            }),
          { ...STRIPE_RETRY_OPTIONS, shouldRetry: isTransientExternalError },
        );
      }
    },
    { ...STRIPE_RETRY_OPTIONS, shouldRetry: isTransientExternalError },
  );
}

async function verifyClerkWebhook(req: Request): Promise<ClerkWebhookEvent> {
  type ClerkRequestLike = Parameters<typeof verifyWebhook>[0];
  return (await verifyWebhook(
    req as unknown as ClerkRequestLike,
  )) as unknown as ClerkWebhookEvent;
}

export const POST = createWebhookHandler(
  createContainer,
  verifyClerkWebhook,
  processClerkWebhook,
  cancelStripeCustomerSubscriptions,
);
