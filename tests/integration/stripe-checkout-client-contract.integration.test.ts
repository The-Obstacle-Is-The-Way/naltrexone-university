import Stripe from 'stripe';
import { describe } from 'vitest';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { runStripeCheckoutClientContract } from '@/tests/shared/stripe-checkout-client-contract';

const RUN_STRIPE_CHECKOUT_CLIENT_CONTRACT =
  process.env.RUN_STRIPE_CHECKOUT_CLIENT_CONTRACT === 'true';
const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? '';
const stripePriceId =
  process.env.STRIPE_CHECKOUT_CONTRACT_PRICE_ID ??
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY ??
  '';

function isUsableStripeTestKey(value: string): boolean {
  return value.startsWith('sk_test_') && !value.includes('dummy');
}

function isUsableStripePriceId(value: string): boolean {
  return value.startsWith('price_') && !value.includes('dummy');
}

const skipReason = !RUN_STRIPE_CHECKOUT_CLIENT_CONTRACT
  ? 'set RUN_STRIPE_CHECKOUT_CLIENT_CONTRACT=true to run the external Stripe contract'
  : !isUsableStripeTestKey(stripeSecretKey)
    ? 'provide a real Stripe test secret key'
    : !isUsableStripePriceId(stripePriceId)
      ? 'provide STRIPE_CHECKOUT_CONTRACT_PRICE_ID or NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY'
      : null;

const describeStripeContract = skipReason ? describe.skip : describe;

function getStripe(): Stripe {
  if (skipReason) {
    throw new Error(`Stripe Checkout client contract skipped: ${skipReason}`);
  }

  return new Stripe(stripeSecretKey, { apiVersion: STRIPE_API_VERSION });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

runStripeCheckoutClientContract(
  `real Stripe TEST mode${skipReason ? ` (skipped: ${skipReason})` : ''}`,
  async () => {
    const stripe = getStripe();
    const customer = await stripe.customers.create({
      metadata: { test_contract: 'debt_472_checkout_client' },
    });
    const createdSessionIds = new Set<string>();

    const sessions = {
      create: async (params, options) => {
        const session = await stripe.checkout.sessions.create(params, options);
        createdSessionIds.add(session.id);
        return session;
      },
      list: (params) => stripe.checkout.sessions.list(params),
      retrieve: (sessionId, params) =>
        stripe.checkout.sessions.retrieve(sessionId, params),
      expire: (sessionId, params, options) =>
        stripe.checkout.sessions.expire(sessionId, params, options),
    } satisfies StripeClient['checkout']['sessions'];

    return {
      sessions,
      subscriptionParams: {
        mode: 'subscription',
        customer: customer.id,
        line_items: [{ price: stripePriceId, quantity: 1 }],
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      },
      // Stripe timestamps Sessions in whole seconds. Advancing by more than one
      // second makes the reverse-chronology assertion independent of ID tie order.
      advanceCreationTime: () => sleep(1_100),
      cleanup: async () => {
        const cleanupErrors: Error[] = [];
        for (const sessionId of createdSessionIds) {
          try {
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            if (session.status === 'open') {
              await stripe.checkout.sessions.expire(sessionId);
            }
          } catch (error) {
            cleanupErrors.push(
              new Error('Failed to clean up a Stripe contract Session', {
                cause: error,
              }),
            );
          }
        }

        try {
          await stripe.customers.del(customer.id);
        } catch (error) {
          cleanupErrors.push(
            new Error('Failed to clean up a Stripe contract Customer', {
              cause: error,
            }),
          );
        }

        if (cleanupErrors.length > 0) {
          throw new AggregateError(
            cleanupErrors,
            'Stripe Checkout client contract cleanup failed',
          );
        }
      },
    };
  },
  describeStripeContract,
);
