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
    const createdSubscriptionIds = new Set<string>();
    let defaultPaymentMethodReady = false;
    const ensureDefaultPaymentMethod = async () => {
      if (defaultPaymentMethodReady) return;
      const paymentMethod = await stripe.paymentMethods.attach('pm_card_visa', {
        customer: customer.id,
      });
      await stripe.customers.update(customer.id, {
        invoice_settings: { default_payment_method: paymentMethod.id },
      });
      defaultPaymentMethodReady = true;
    };

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

    const subscriptions = {
      retrieve: (subscriptionId, params, options) =>
        stripe.subscriptions.retrieve(subscriptionId, params, options),
      list: (params, options) => stripe.subscriptions.list(params, options),
      // A canceled Subscription is untracked at once: cleanup's own cancel
      // would otherwise get Stripe's 404 for an already-canceled one.
      cancel: async (subscriptionId, params, options) => {
        const canceled = await stripe.subscriptions.cancel(
          subscriptionId,
          params,
          options,
        );
        createdSubscriptionIds.delete(subscriptionId);
        return canceled;
      },
    } satisfies NonNullable<StripeClient['subscriptions']>;

    return {
      sessions,
      subscriptions,
      seedSubscription: async () => {
        await ensureDefaultPaymentMethod();
        const subscription = await stripe.subscriptions.create({
          customer: customer.id,
          items: [{ price: stripePriceId }],
          metadata: { user_id: 'debt472_contract_user' },
        });
        createdSubscriptionIds.add(subscription.id);
        return { id: subscription.id, customer: customer.id };
      },
      seedCanceledSubscription: async () => {
        await ensureDefaultPaymentMethod();
        const subscription = await stripe.subscriptions.create({
          customer: customer.id,
          items: [{ price: stripePriceId }],
          metadata: { user_id: 'debt472_contract_user' },
        });
        // Tracked until the cancel succeeds, so cleanup can still cancel it
        // if this call fails.
        createdSubscriptionIds.add(subscription.id);
        await stripe.subscriptions.cancel(subscription.id);
        createdSubscriptionIds.delete(subscription.id);
        return { id: subscription.id, customer: customer.id };
      },
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

        for (const subscriptionId of createdSubscriptionIds) {
          try {
            await stripe.subscriptions.cancel(subscriptionId);
          } catch (error) {
            cleanupErrors.push(
              new Error('Failed to clean up a Stripe contract Subscription', {
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
