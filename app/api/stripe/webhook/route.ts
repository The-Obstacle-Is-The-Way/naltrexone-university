import { createContainer } from '@/lib/container';
import { createRequestContext, getRequestLogger } from '@/lib/request-context';
import { processStripeWebhook } from '@/src/adapters/controllers/stripe-webhook-controller';
import { createWebhookHandler } from './handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = createWebhookHandler(() => {
  const ctx = createRequestContext();
  const logger = getRequestLogger(ctx);
  return createContainer({ primitives: { logger } });
}, processStripeWebhook);
