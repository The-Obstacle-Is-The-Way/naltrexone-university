import { beforeEach, describe, expect, it } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import { createStripeCheckoutSession } from './stripe-checkout-sessions';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

function sessionUrl(id: string): string {
  return `https://checkout.stripe.test/${id}`;
}

// Holds both callers' preflight listings (the only `status: 'open', limit: 1`
// listings the adapter makes) until the second one arrives, so neither caller
// can see the other's Session before both have created.
function holdPreflightListingsUntilBothArrive(
  stripe: FakeStripeCheckoutClient,
): void {
  let arrivals = 0;
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  stripe.setListHook(async (params) => {
    if (params.status !== 'open' || params.limit !== 1) return;
    arrivals += 1;
    if (arrivals === 2) release();
    await released;
  });
}

async function sessionsByStatus(
  stripe: FakeStripeCheckoutClient,
  status: 'open' | 'expired',
) {
  const listed = await stripe.checkout.sessions.list({
    customer: 'cus_123',
    status,
    limit: 10,
  });
  return listed.data;
}

describe('createStripeCheckoutSession concurrency', () => {
  const appUserId = crypto.randomUUID();
  const input = {
    userId: appUserId,
    externalCustomerId: 'cus_123',
    ...createTestRenewalTerms('monthly'),
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
  };
  const priceIds = { monthly: 'price_m', annual: 'price_a' } as const;
  let logger: FakeLogger;

  beforeEach(() => {
    logger = new FakeLogger();
  });

  it('collapses concurrent same-plan creates into one Stripe session', async () => {
    const stripe = new FakeStripeCheckoutClient();
    holdPreflightListingsUntilBothArrive(stripe);

    const [first, second] = await Promise.all([
      createStripeCheckoutSession({
        stripe,
        input: { ...input, trialPeriodDays: 7 },
        priceIds,
        logger,
      }),
      createStripeCheckoutSession({
        stripe,
        input: { ...input, trialPeriodDays: 7 },
        priceIds,
        logger,
      }),
    ]);

    expect(first).toEqual({ url: sessionUrl('cs_fake_1') });
    expect(second).toEqual(first);
    await expect(sessionsByStatus(stripe, 'open')).resolves.toHaveLength(1);
    expect(stripe.createCalls.map(({ options }) => options)).toEqual([
      { idempotencyKey: `checkout_session:${appUserId}:monthly:trial:7` },
      { idempotencyKey: `checkout_session:${appUserId}:monthly:trial:7` },
    ]);
  });

  it('expires superseded concurrent different-plan creates so one completable session survives', async () => {
    const stripe = new FakeStripeCheckoutClient();
    holdPreflightListingsUntilBothArrive(stripe);

    await Promise.all([
      createStripeCheckoutSession({
        stripe,
        input: {
          ...input,
          ...createTestRenewalTerms('monthly', true),
          trialPeriodDays: 7,
        },
        priceIds,
        logger,
      }),
      createStripeCheckoutSession({
        stripe,
        input: {
          ...input,
          ...createTestRenewalTerms('annual', true),
          trialPeriodDays: 7,
        },
        priceIds,
        logger,
      }),
    ]);

    await expect(sessionsByStatus(stripe, 'open')).resolves.toEqual([
      expect.objectContaining({
        id: 'cs_fake_2',
        line_items: { data: [{ price: { id: 'price_a' } }] },
        status: 'open',
      }),
    ]);
    await expect(sessionsByStatus(stripe, 'expired')).resolves.toEqual([
      expect.objectContaining({
        id: 'cs_fake_1',
        line_items: { data: [{ price: { id: 'price_m' } }] },
        status: 'expired',
      }),
    ]);
    expect(stripe.createCalls.map(({ options }) => options)).toEqual([
      { idempotencyKey: `checkout_session:${appUserId}:monthly:trial:7` },
      { idempotencyKey: `checkout_session:${appUserId}:annual:trial:7` },
    ]);
  });
});
