import Stripe from 'stripe';
import { afterEach, describe, expect, it } from 'vitest';

const STRIPE_API_VERSION = '2026-05-27.dahlia';
const RUN_STRIPE_TRIAL_CLOCK_SMOKE =
  process.env.RUN_STRIPE_TRIAL_CLOCK_SMOKE === 'true';
const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? '';
const stripePriceId =
  process.env.STRIPE_TRIAL_CLOCK_PRICE_ID ??
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY ??
  '';

function isUsableStripeTestKey(value: string): boolean {
  return value.startsWith('sk_test_') && !value.includes('dummy');
}

function isUsableStripePriceId(value: string): boolean {
  return value.startsWith('price_') && !value.includes('dummy');
}

const skipReason = !RUN_STRIPE_TRIAL_CLOCK_SMOKE
  ? 'set RUN_STRIPE_TRIAL_CLOCK_SMOKE=true to run the external Stripe smoke'
  : !isUsableStripeTestKey(stripeSecretKey)
    ? 'provide a real Stripe test secret key'
    : !isUsableStripePriceId(stripePriceId)
      ? 'provide STRIPE_TRIAL_CLOCK_PRICE_ID or NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY'
      : null;

const describeStripeSmoke = skipReason ? describe.skip : describe;
const createdCustomerIds: string[] = [];
const createdTestClockIds: string[] = [];

function getStripe(): Stripe {
  if (skipReason) {
    throw new Error(`Stripe trial clock smoke skipped: ${skipReason}`);
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}

function secondsFromIso(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTestClockReady(stripe: Stripe, testClockId: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const clock = await stripe.testHelpers.testClocks.retrieve(testClockId);
    if (clock.status === 'ready') return clock;
    await sleep(250);
  }

  throw new Error(`Stripe test clock ${testClockId} did not become ready`);
}

async function waitForSubscriptionStatus(
  stripe: Stripe,
  subscriptionId: string,
  expectedStatus: Stripe.Subscription.Status,
) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.status === expectedStatus) return subscription;
    await sleep(250);
  }

  throw new Error(
    `Stripe subscription ${subscriptionId} did not become ${expectedStatus}`,
  );
}

async function createTrialingSubscription(input: {
  stripe: Stripe;
  customerId: string;
}) {
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
  if (skipReason) return;

  const stripe = getStripe();
  while (createdCustomerIds.length > 0) {
    const customerId = createdCustomerIds.pop();
    if (!customerId) continue;
    await stripe.customers.del(customerId);
  }

  while (createdTestClockIds.length > 0) {
    const testClockId = createdTestClockIds.pop();
    if (!testClockId) continue;
    await stripe.testHelpers.testClocks.del(testClockId);
  }
});

describeStripeSmoke(
  `Stripe no-card trial clock smoke${
    skipReason ? ` (skipped: ${skipReason})` : ''
  }`,
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
      await waitForTestClockReady(stripe, clock.id);

      await expect(
        waitForSubscriptionStatus(stripe, subscription.id, 'canceled'),
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
      await waitForTestClockReady(stripe, clock.id);

      await expect(
        waitForSubscriptionStatus(stripe, subscription.id, 'active'),
      ).resolves.toMatchObject({ status: 'active' });
    });
  },
);
