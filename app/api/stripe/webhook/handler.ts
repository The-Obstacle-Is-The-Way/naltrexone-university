import { NextResponse } from 'next/server';
import type {
  StripeWebhookDeps,
  StripeWebhookInput,
} from '@/src/adapters/controllers/stripe-webhook-controller';
import { isApplicationError } from '@/src/application/errors';

type StripeWebhookRouteLogger = {
  error: (context: unknown, message: string) => void;
};

export type StripeWebhookRouteContainer = {
  logger: StripeWebhookRouteLogger;
  createStripeWebhookDeps: () => StripeWebhookDeps;
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

    const rawBody = await req.text();
    const container = createContainer();

    try {
      await processStripeWebhook(container.createStripeWebhookDeps(), {
        rawBody,
        signature,
      });

      return NextResponse.json({ received: true }, { status: 200 });
    } catch (error) {
      if (
        isApplicationError(error) &&
        error.code === 'INVALID_WEBHOOK_SIGNATURE'
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
