import Stripe from 'stripe';
import { describe } from 'vitest';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import {
  STRIPE_TEST_MAX_NETWORK_RETRIES,
  STRIPE_TEST_REQUEST_TIMEOUT_MS,
} from '@/tests/e2e/helpers/stripe-test-client';
import { runStripeCheckoutClientContract } from '@/tests/shared/stripe-checkout-client-contract';
import { resolveStripeProviderGate } from '@/tests/shared/stripe-provider-gate';

const providerGate = resolveStripeProviderGate(process.env, {
  flag: 'RUN_STRIPE_CHECKOUT_CLIENT_CONTRACT',
  priceKeys: [
    'STRIPE_CHECKOUT_CONTRACT_PRICE_ID',
    'NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY',
  ],
});
const describeStripeContract =
  providerGate.mode === 'skip' ? describe.skip : describe;

function requireProviderRun() {
  if (providerGate.mode === 'skip') {
    throw new Error(
      `Stripe Checkout client contract skipped: ${providerGate.reason}`,
    );
  }
  return providerGate;
}

function getStripe(): Stripe {
  const { stripeSecretKey } = requireProviderRun();

  // Bound the provider call so one hung request cannot outrun the per-case
  // budget this contract advertises; stripe-node otherwise defaults to an
  // 80-second timeout with automatic retries.
  return new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: STRIPE_TEST_MAX_NETWORK_RETRIES,
    timeout: STRIPE_TEST_REQUEST_TIMEOUT_MS,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

runStripeCheckoutClientContract(
  `real Stripe TEST mode${providerGate.mode === 'skip' ? ` (skipped: ${providerGate.reason})` : ''}`,
  async () => {
    const stripe = getStripe();
    const { stripePriceId } = requireProviderRun();
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
