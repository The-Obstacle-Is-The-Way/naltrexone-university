import 'server-only';
import { currentUser } from '@clerk/nextjs/server';
import {
  ClerkAuthGateway,
  StripePaymentGateway,
} from '@/src/adapters/gateways';
import { db } from './db';
import { env } from './env';
import { logger } from './logger';
import { stripe } from './stripe';

/**
 * Composition root primitives.
 *
 * As we build out `src/application/**` and `src/adapters/**`, this file will grow
 * factory functions that wire ports -> concrete implementations.
 */
export function createContainerPrimitives() {
  return {
    db,
    env,
    logger,
    stripe,
  } as const;
}

export function createContainer() {
  const primitives = createContainerPrimitives();

  return {
    ...primitives,
    authGateway: new ClerkAuthGateway({
      db: primitives.db,
      getClerkUser: currentUser,
    }),
    paymentGateway: new StripePaymentGateway({
      stripe: primitives.stripe,
      webhookSecret: primitives.env.STRIPE_WEBHOOK_SECRET,
      priceIds: {
        monthly: primitives.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY,
        annual: primitives.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
      },
    }),
  } as const;
}
