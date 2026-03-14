import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { createContainer } from '@/lib/container';
import { createRequestContext, getRequestLogger } from '@/lib/request-context';
import type { ClerkWebhookEvent } from '@/src/adapters/controllers/clerk-webhook-controller';
import { processClerkWebhook } from '@/src/adapters/controllers/clerk-webhook-controller';
import { cancelStripeCustomerSubscriptions } from '@/src/adapters/gateways/stripe-subscription-canceler';
import { createWebhookHandler } from './handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function verifyClerkWebhook(req: Request): Promise<ClerkWebhookEvent> {
  type ClerkRequestLike = Parameters<typeof verifyWebhook>[0];
  // Clerk's runtime accepts Web Request, but RequestLike currently omits it.
  const verifiedEvent = await verifyWebhook(req as unknown as ClerkRequestLike);
  const eventIdFromPayload = (verifiedEvent as { id?: unknown }).id;
  const eventId =
    req.headers.get('svix-id') ??
    (typeof eventIdFromPayload === 'string' ? eventIdFromPayload : null);

  if (!eventId) {
    throw new Error('Clerk webhook event id is required');
  }

  return {
    eventId,
    type: verifiedEvent.type,
    data: verifiedEvent.data,
  };
}

export const POST = createWebhookHandler(
  () => {
    const ctx = createRequestContext();
    const logger = getRequestLogger(ctx);
    const container = createContainer({ primitives: { logger } });

    return {
      logger: container.logger,
      stripe: container.stripe,
      createRateLimiter: container.createRateLimiter,
      transaction: async (fn) =>
        container.db.transaction(async (tx) =>
          fn({
            clerkEvents: container.createClerkEventRepository(tx),
            deletedClerkUsers: container.createDeletedClerkUserRepository(tx),
            pendingStripeCancellations:
              container.createPendingStripeCancellationRepository(tx),
            userRepository: container.createUserRepository(tx),
            stripeCustomerRepository:
              container.createStripeCustomerRepository(tx),
          }),
        ),
    };
  },
  verifyClerkWebhook,
  processClerkWebhook,
  cancelStripeCustomerSubscriptions,
);
