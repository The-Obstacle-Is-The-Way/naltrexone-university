import { NextResponse } from 'next/server';
import { createContainer } from '@/lib/container';
import { processStripeWebhook } from '@/src/adapters/controllers/stripe-webhook-controller';
import {
  DrizzleStripeCustomerRepository,
  DrizzleStripeEventRepository,
  DrizzleSubscriptionRepository,
} from '@/src/adapters/repositories';
import { isApplicationError } from '@/src/application/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
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
}
