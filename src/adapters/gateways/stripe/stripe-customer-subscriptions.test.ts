import { describe, expect, it } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { listStripeBlockingCustomerSubscriptions } from './stripe-customer-subscriptions';
import {
  FakeStripeCheckoutClient,
  type SeededSubscription,
} from './test-helpers/fake-stripe-checkout-client';

const PRICE_IDS = { monthly: 'price_m', annual: 'price_a' } as const;
const userId = crypto.randomUUID();
const PERIOD_END = Date.parse('2026-11-01T00:00:00Z') / 1000;
const STARTED = Date.parse('2026-10-01T00:00:00Z') / 1000;

const subscription = (
  overrides: Partial<SeededSubscription> = {},
): SeededSubscription => ({
  id: 'sub_active',
  customer: 'cus_1',
  status: 'active',
  cancel_at_period_end: false,
  start_date: STARTED,
  billing_cycle_anchor: STARTED,
  metadata: { user_id: userId },
  items: {
    data: [{ current_period_end: PERIOD_END, price: { id: 'price_m' } }],
  },
  ...overrides,
});

function stripeWith(...seeded: SeededSubscription[]) {
  const stripe = new FakeStripeCheckoutClient();
  for (const each of seeded) stripe.seedSubscription(each);
  return stripe;
}

const list = (
  stripe: FakeStripeCheckoutClient,
  options: { webhookE2EOwner?: string } = {},
) =>
  listStripeBlockingCustomerSubscriptions({
    stripe,
    externalCustomerId: 'cus_1',
    priceIds: PRICE_IDS,
    logger: new FakeLogger(),
    ...options,
  });

// BUG-321: the subscriptions that make Stripe refuse a new checkout, read so
// our database can record them. Reading only: nothing is cancelled.
describe('listStripeBlockingCustomerSubscriptions', () => {
  it("returns the customer's blocking subscription, retrieved afresh and normalized", async () => {
    const stripe = stripeWith(subscription());

    await expect(list(stripe)).resolves.toEqual([
      {
        userId,
        externalCustomerId: 'cus_1',
        externalSubscriptionId: 'sub_active',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date(PERIOD_END * 1000),
        cancelAtPeriodEnd: false,
        startedAt: new Date(STARTED * 1000),
        billingCycleAnchor: new Date(STARTED * 1000),
      },
    ]);
    expect(stripe.subscriptions.listCalls).toEqual([
      { customer: 'cus_1', status: 'all', limit: 10 },
    ]);
    expect(stripe.subscriptions.retrieveCalls).toEqual(['sub_active']);
  });

  it('skips subscriptions that do not block a checkout, and other customers', async () => {
    const stripe = stripeWith(
      subscription({ id: 'sub_canceled', status: 'canceled' }),
      subscription({ id: 'sub_expired', status: 'incomplete_expired' }),
      subscription({ id: 'sub_elsewhere', customer: 'cus_2' }),
      subscription({ id: 'sub_trial', status: 'trialing' }),
    );

    const listed = await list(stripe);

    expect(listed.map((each) => each.externalSubscriptionId)).toEqual([
      'sub_trial',
    ]);
    expect(stripe.subscriptions.retrieveCalls).toEqual(['sub_trial']);
  });

  it('returns none when nothing blocks', async () => {
    await expect(list(stripeWith())).resolves.toEqual([]);
  });

  it('refuses a subscription with no user on it', async () => {
    const stripe = stripeWith(subscription({ metadata: {} }));

    await expect(list(stripe)).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
  });

  it("refuses a subscription another test run's owner holds", async () => {
    const stripe = stripeWith(
      subscription({ metadata: { user_id: userId, e2e_owner: 'run-a' } }),
    );

    await expect(
      list(stripe, { webhookE2EOwner: 'run-b' }),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
  });

  it('refuses a retrieved subscription whose customer is not the one asked for', async () => {
    const stripe = stripeWith(subscription());
    stripe.setSubscriptionRetrieveOverride((retrieved) => ({
      ...retrieved,
      customer: 'cus_2',
    }));

    await expect(list(stripe)).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
  });
});
