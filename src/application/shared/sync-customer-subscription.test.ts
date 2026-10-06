import { describe, expect, it } from 'vitest';
import { createSubscription } from '@/src/domain/test-helpers';
import type { SubscriptionObservation } from '../ports/gateways';
import {
  FakePaymentGateway,
  FakeSubscriptionRepository,
} from '../test-helpers/fakes';
import { syncCustomerSubscriptionFromProvider } from './sync-customer-subscription';

const observation = (
  overrides: Partial<SubscriptionObservation> = {},
): SubscriptionObservation => ({
  userId: 'user-1',
  externalCustomerId: 'cus_1',
  externalSubscriptionId: 'sub_active',
  plan: 'monthly',
  status: 'active',
  currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
  cancelAtPeriodEnd: false,
  startedAt: new Date('2026-10-01T00:00:00Z'),
  billingCycleAnchor: new Date('2026-10-01T00:00:00Z'),
  ...overrides,
});

const gatewayListing = (
  listed: SubscriptionObservation[] | Error,
): FakePaymentGateway =>
  new FakePaymentGateway({
    externalCustomerId: 'cus_1',
    checkoutUrl: 'https://stripe/checkout',
    portalUrl: 'https://stripe/portal',
    webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    ...(listed instanceof Error
      ? { blockingCustomerSubscriptionsError: listed }
      : { blockingCustomerSubscriptions: listed }),
  });

const sync = (
  payments: FakePaymentGateway,
  subscriptions: FakeSubscriptionRepository,
) =>
  syncCustomerSubscriptionFromProvider({
    userId: 'user-1',
    externalCustomerId: 'cus_1',
    payments,
    subscriptions,
  });

// BUG-321: Stripe refused a checkout because this customer already has a
// subscription our database lacks, so record it from Stripe.
describe('syncCustomerSubscriptionFromProvider', () => {
  it("records the customer's subscription, so the user is entitled", async () => {
    const payments = gatewayListing([observation()]);
    const subscriptions = new FakeSubscriptionRepository();

    await sync(payments, subscriptions);

    await expect(subscriptions.findByUserId('user-1')).resolves.toMatchObject({
      userId: 'user-1',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
    });
    expect(payments.blockingCustomerSubscriptionInputs).toEqual([
      { externalCustomerId: 'cus_1' },
    ]);
  });

  it('records the canonical one of several: entitled first, then the latest period', async () => {
    const subscriptions = new FakeSubscriptionRepository();

    await sync(
      gatewayListing([
        observation({
          externalSubscriptionId: 'sub_unpaid',
          status: 'unpaid',
          currentPeriodEnd: new Date('2027-01-01T00:00:00Z'),
        }),
        observation({
          externalSubscriptionId: 'sub_early',
          currentPeriodEnd: new Date('2026-10-20T00:00:00Z'),
        }),
        observation({ externalSubscriptionId: 'sub_late' }),
      ]),
      subscriptions,
    );

    await expect(
      subscriptions.findExternalSubscriptionIdByUserId('user-1'),
    ).resolves.toBe('sub_late');
  });

  it.each([
    ['another user', observation({ userId: 'user-2' })],
    ['another customer', observation({ externalCustomerId: 'cus_2' })],
  ])(
    'writes nothing when a subscription belongs to %s',
    async (_case, foreign) => {
      const subscriptions = new FakeSubscriptionRepository();

      await expect(
        sync(gatewayListing([observation(), foreign]), subscriptions),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(subscriptions.findByUserId('user-1')).resolves.toBeNull();
    },
  );

  it('fails when Stripe lists no blocking subscription', async () => {
    await expect(
      sync(gatewayListing([]), new FakeSubscriptionRepository()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('passes a listing failure on', async () => {
    const failure = new Error('stripe down');

    await expect(
      sync(gatewayListing(failure), new FakeSubscriptionRepository()),
    ).rejects.toBe(failure);
  });

  it('keeps a row the write guard prefers', async () => {
    const current = createSubscription({
      userId: 'user-1',
      status: 'active',
      currentPeriodEnd: new Date('2027-06-01T00:00:00Z'),
    });
    const subscriptions = new FakeSubscriptionRepository([
      { subscription: current, externalSubscriptionId: 'sub_current' },
    ]);

    await sync(
      gatewayListing([
        observation({
          externalSubscriptionId: 'sub_other',
          status: 'unpaid',
          currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
        }),
      ]),
      subscriptions,
    );

    await expect(subscriptions.findByUserId('user-1')).resolves.toMatchObject({
      status: 'active',
      currentPeriodEnd: current.currentPeriodEnd,
    });
  });
});
