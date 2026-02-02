import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { createContainer } from '@/lib/container';
import { stripe } from '@/lib/stripe';
import { processClerkWebhook } from '@/src/adapters/controllers/clerk-webhook-controller';
import { createWebhookHandler } from './handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function cancelStripeCustomerSubscriptions(
  stripeCustomerId: string,
): Promise<void> {
  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'all',
    limit: 100,
  });

  for (const subscription of subscriptions.data) {
    if (
      subscription.status === 'canceled' ||
      subscription.status === 'incomplete_expired'
    ) {
      continue;
    }
    await stripe.subscriptions.cancel(subscription.id);
  }
}

export const POST = createWebhookHandler(
  createContainer,
  verifyWebhook,
  processClerkWebhook,
  cancelStripeCustomerSubscriptions,
);
