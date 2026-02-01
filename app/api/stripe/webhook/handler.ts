import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { NextResponse } from 'next/server';
import type * as schema from '@/db/schema';
import type {
  StripeWebhookDeps,
  StripeWebhookInput,
} from '@/src/adapters/controllers/stripe-webhook-controller';
import {
  DrizzleStripeCustomerRepository,
  DrizzleStripeEventRepository,
  DrizzleSubscriptionRepository,
} from '@/src/adapters/repositories';
import { isApplicationError } from '@/src/application/errors';
import type { PaymentGateway } from '@/src/application/ports/gateways';

type StripeWebhookRouteDb = {
  transaction: <T>(
    fn: (tx: PostgresJsDatabase<typeof schema>) => Promise<T>,
  ) => Promise<T>;
};

type StripeWebhookRouteEnv = {
  NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: string;
  NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: string;
};

type StripeWebhookRouteLogger = {
  error: (context: unknown, message: string) => void;
};

export type StripeWebhookRouteContainer = {
  db: StripeWebhookRouteDb;
  env: StripeWebhookRouteEnv;
  logger: StripeWebhookRouteLogger;
  paymentGateway: PaymentGateway;
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
      await processStripeWebhook(
        {
          paymentGateway: container.paymentGateway,
          transaction: async (fn) =>
            container.db.transaction(async (tx) =>
              fn({
                stripeEvents: new DrizzleStripeEventRepository(tx),
                subscriptions: new DrizzleSubscriptionRepository(tx, {
                  monthly: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY,
                  annual: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
                }),
                stripeCustomers: new DrizzleStripeCustomerRepository(tx),
              }),
            ),
        },
        { rawBody, signature },
      );

      return NextResponse.json({ received: true }, { status: 200 });
    } catch (error) {
      if (
        isApplicationError(error) &&
        error.code === 'STRIPE_ERROR' &&
        error.message === 'Invalid webhook signature'
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
