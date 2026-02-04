import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { createContainer } from '@/lib/container';
import type { ClerkWebhookEvent } from '@/src/adapters/controllers/clerk-webhook-controller';
import { processClerkWebhook } from '@/src/adapters/controllers/clerk-webhook-controller';
import { cancelStripeCustomerSubscriptions } from '@/src/adapters/gateways/stripe-subscription-canceler';
import { createWebhookHandler } from './handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
