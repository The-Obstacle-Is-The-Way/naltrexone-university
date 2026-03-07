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
  return verifyWebhook(req as unknown as ClerkRequestLike);
}

export const POST = createWebhookHandler(
  () => {
    const ctx = createRequestContext();
    const logger = getRequestLogger(ctx);
    return createContainer({ primitives: { logger } });
  },
  verifyClerkWebhook,
  processClerkWebhook,
  cancelStripeCustomerSubscriptions,
);
