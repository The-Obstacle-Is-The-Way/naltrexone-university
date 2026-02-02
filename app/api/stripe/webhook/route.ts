import { createContainer } from '@/lib/container';
import { processStripeWebhook } from '@/src/adapters/controllers/stripe-webhook-controller';
import { createWebhookHandler } from './handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = createWebhookHandler(createContainer, processStripeWebhook);
