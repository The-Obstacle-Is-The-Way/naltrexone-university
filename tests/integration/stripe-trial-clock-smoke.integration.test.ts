import Stripe from 'stripe';
import { afterEach, describe, expect, it } from 'vitest';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';
import { resolveStripeProviderGate } from '@/tests/shared/stripe-provider-gate';
import {
  createStripeProviderPollDeadline,
  pollStripeProviderState,
  type StripeProviderPollDeadline,
} from '@/tests/shared/stripe-provider-state-poll';

const providerGate = resolveStripeProviderGate(process.env, {
  flag: 'RUN_STRIPE_TRIAL_CLOCK_SMOKE',
  priceKeys: [
    'STRIPE_TRIAL_CLOCK_PRICE_ID',
    'NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY',
  ],
});
const describeStripeSmoke =
  providerGate.mode === 'skip' ? describe.skip : describe;
const createdCustomerIds: string[] = [];
const createdTestClockIds: string[] = [];

function requireProviderRun() {
  if (providerGate.mode === 'skip') {
    throw new Error(`Stripe trial clock smoke skipped: ${providerGate.reason}`);
  }
  return providerGate;
}

function getStripe(): Stripe {
  const { stripeSecretKey } = requireProviderRun();

  return new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}

function secondsFromIso(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

async function waitForTestClockReady(
  stripe: Stripe,
  testClockId: string,
  deadline: StripeProviderPollDeadline,
) {
  return pollStripeProviderState({
    description: `Stripe test clock ${testClockId} did not become ready`,
    deadline,
    fetch: () => stripe.testHelpers.testClocks.retrieve(testClockId),
    isDone: (clock) => clock.status === 'ready',
    describeValue: (clock) => `clock status ${clock.status}`,
  });
}

async function waitForSubscriptionStatus(
  stripe: Stripe,
  subscriptionId: string,
  expectedStatus: Stripe.Subscription.Status,
  deadline: StripeProviderPollDeadline,
) {
  return pollStripeProviderState({
    description: `Stripe subscription ${subscriptionId} did not become ${expectedStatus}`,
    deadline,
    fetch: () => stripe.subscriptions.retrieve(subscriptionId),
    isDone: (subscription) => subscription.status === expectedStatus,
    describeValue: (subscription) =>
      `subscription status ${subscription.status}`,
  });
}

async function createTrialingSubscription(input: {
  stripe: Stripe;
  customerId: string;
}) {
  const { stripePriceId } = requireProviderRun();
  return input.stripe.subscriptions.create({
    customer: input.customerId,
    items: [{ price: stripePriceId }],
    trial_period_days: 7,
    trial_settings: {
      end_behavior: {
        missing_payment_method: 'cancel',
      },
    },
  });
}

async function createTestClockCustomer(input: {
  stripe: Stripe;
  label: string;
}) {
  const clock = await input.stripe.testHelpers.testClocks.create({
    frozen_time: secondsFromIso('2026-06-01T00:00:00Z'),
    name: `DEBT-410 ${input.label}`,
  });
  createdTestClockIds.push(clock.id);

  const customer = await input.stripe.customers.create({
    email: `debt-410-${input.label}@example.com`,
    test_clock: clock.id,
  });
  createdCustomerIds.push(customer.id);

  return { clock, customer };
}

afterEach(async () => {
  if (providerGate.mode === 'skip') return;

  const stripe = getStripe();
  const cleanupErrors: Error[] = [];
  while (createdCustomerIds.length > 0) {
    const customerId = createdCustomerIds.pop();
    if (!customerId) continue;
    try {
      await stripe.customers.del(customerId);
    } catch (error) {
      cleanupErrors.push(
        new Error(`Failed to delete Stripe customer ${customerId}`, {
          cause: error,
        }),
      );
    }
  }

  while (createdTestClockIds.length > 0) {
    const testClockId = createdTestClockIds.pop();
    if (!testClockId) continue;
    try {
      await stripe.testHelpers.testClocks.del(testClockId);
    } catch (error) {
      cleanupErrors.push(
        new Error(`Failed to delete Stripe test clock ${testClockId}`, {
          cause: error,
        }),
      );
    }
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      'Failed to clean up Stripe trial clock smoke resources',
    );
  }
});

describeStripeSmoke(
  `Stripe no-card trial clock smoke${providerGate.mode === 'skip' ? ` (skipped: ${providerGate.reason})` : ''}`,
  () => {
    it('cancels a trialing subscription at trial end when no card is present', async () => {
      const stripe = getStripe();
      const { clock, customer } = await createTestClockCustomer({
        stripe,
        label: 'no-card-cancel',
      });
      const subscription = await createTrialingSubscription({
        stripe,
        customerId: customer.id,
      });

      expect(subscription.status).toBe('trialing');
      expect(subscription.trial_end).toBeTypeOf('number');

      await stripe.testHelpers.testClocks.advance(clock.id, {
        frozen_time: (subscription.trial_end ?? clock.frozen_time) + 60,
      });
      const deadline = createStripeProviderPollDeadline();
      await waitForTestClockReady(stripe, clock.id, deadline);

      await expect(
        waitForSubscriptionStatus(
          stripe,
          subscription.id,
          'canceled',
          deadline,
        ),
      ).resolves.toMatchObject({ status: 'canceled' });
    });

    it('activates a trialing subscription at trial end when a card is present', async () => {
      const stripe = getStripe();
      const { clock, customer } = await createTestClockCustomer({
        stripe,
        label: 'card-active',
      });

      const paymentMethod = await stripe.paymentMethods.attach('pm_card_visa', {
        customer: customer.id,
      });
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: paymentMethod.id,
        },
      });

      const subscription = await createTrialingSubscription({
        stripe,
        customerId: customer.id,
      });

      expect(subscription.status).toBe('trialing');
      expect(subscription.trial_end).toBeTypeOf('number');

      await stripe.testHelpers.testClocks.advance(clock.id, {
        frozen_time: (subscription.trial_end ?? clock.frozen_time) + 60,
      });
      const deadline = createStripeProviderPollDeadline();
      await waitForTestClockReady(stripe, clock.id, deadline);

      await expect(
        waitForSubscriptionStatus(stripe, subscription.id, 'active', deadline),
      ).resolves.toMatchObject({ status: 'active' });
    });
  },
);
