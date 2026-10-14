import { beforeEach, describe, expect, it } from 'vitest';
import type { CheckoutSessionCreateParams } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { expireOtherOpenSubscriptionCheckoutSessions } from './stripe-checkout-sessions';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

// BUG-343 option 3: once a subscription Checkout completes, any other open
// subscription Session for the same customer could still create a second
// subscription until Stripe expires it, 24 hours after creation.
describe('expireOtherOpenSubscriptionCheckoutSessions', () => {
  const customer = 'cus_sweep';
  let logger: FakeLogger;

  beforeEach(() => {
    logger = new FakeLogger();
  });

  const createdMs = 1_700_000_000_000;
  let fakeNowMs = createdMs;

  function createFake(): FakeStripeCheckoutClient {
    fakeNowMs = createdMs;
    return new FakeStripeCheckoutClient(() => fakeNowMs);
  }

  async function openSession(
    stripe: FakeStripeCheckoutClient,
    options: { customer?: string; mode?: 'subscription' | 'payment' } = {},
  ): Promise<string> {
    const params: CheckoutSessionCreateParams = {
      mode: options.mode ?? 'subscription',
      customer: options.customer ?? customer,
      line_items: [{ price: 'price_m', quantity: 1 }],
      success_url: 'https://app/success',
      cancel_url: 'https://app/cancel',
    };
    const session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: `seed:${crypto.randomUUID()}`,
    });
    return session.id;
  }

  async function statusOf(
    stripe: FakeStripeCheckoutClient,
    sessionId: string,
  ): Promise<string | null | undefined> {
    return (await stripe.checkout.sessions.retrieve(sessionId)).status;
  }

  function sweep(
    stripe: FakeStripeCheckoutClient,
    keepSessionId: string,
    createdBefore?: Date,
  ) {
    return expireOtherOpenSubscriptionCheckoutSessions({
      stripe,
      input: {
        externalCustomerId: customer,
        keepSessionId,
        ...(createdBefore ? { createdBefore } : {}),
      },
      logger,
    });
  }

  it("expires the customer's other open subscription Sessions and keeps the completed one", async () => {
    const stripe = createFake();
    const completed = await openSession(stripe);
    const second = await openSession(stripe);
    const third = await openSession(stripe);
    const anotherCustomers = await openSession(stripe, {
      customer: 'cus_other',
    });
    stripe.markComplete(completed, 'sub_completed');

    await sweep(stripe, completed);

    expect(await statusOf(stripe, completed)).toBe('complete');
    expect(await statusOf(stripe, second)).toBe('expired');
    expect(await statusOf(stripe, third)).toBe('expired');
    expect(await statusOf(stripe, anotherCustomers)).toBe('open');
  });

  it('does not expire the completed Session while Stripe still lists it as open', async () => {
    const stripe = createFake();
    const completed = await openSession(stripe);

    await sweep(stripe, completed);

    expect(stripe.expireCalls).toEqual([]);
  });

  it('leaves an open Session that cannot create a subscription', async () => {
    const stripe = createFake();
    const completed = await openSession(stripe);
    const payment = await openSession(stripe, { mode: 'payment' });
    stripe.markComplete(completed, 'sub_completed');

    await sweep(stripe, completed);

    expect(await statusOf(stripe, payment)).toBe('open');
  });

  it('logs an error, and goes on, when another Session completed too', async () => {
    const stripe = createFake();
    const completed = await openSession(stripe);
    const second = await openSession(stripe);
    const third = await openSession(stripe);
    stripe.markComplete(completed, 'sub_completed');
    // The second Session completes just before the sweep expires it, so
    // Stripe refuses the expire: a second subscription now exists.
    stripe.setExpireFault((sessionId) => {
      if (sessionId === second) stripe.markComplete(second, 'sub_second');
    });

    await sweep(stripe, completed);

    expect(logger.errorCalls).toContainEqual(
      expect.objectContaining({
        context: expect.objectContaining({
          sessionId: second,
          keptSessionId: completed,
          sessionSubscriptionId: 'sub_second',
        }),
        msg: 'Another subscription Checkout completed for the same customer',
      }),
    );
    expect(await statusOf(stripe, third)).toBe('expired');
  });

  it('throws when an open Session cannot be expired, so the webhook is retried', async () => {
    const stripe = createFake();
    const completed = await openSession(stripe);
    await openSession(stripe);
    stripe.markComplete(completed, 'sub_completed');
    stripe.setExpireFault(() => {
      throw new Error('expire failed');
    });

    await expect(sweep(stripe, completed)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
    });
  });

  it('warns for each other Session it expires', async () => {
    const stripe = createFake();
    const completed = await openSession(stripe);
    const second = await openSession(stripe);
    stripe.markComplete(completed, 'sub_completed');

    await sweep(stripe, completed);

    expect(logger.warnCalls).toContainEqual(
      expect.objectContaining({
        context: expect.objectContaining({ sessionId: second }),
        msg: 'Expired another open subscription checkout session after a completion',
      }),
    );
  });

  it("keeps a Session created after the completion's event, which belongs to a later checkout", async () => {
    const stripe = createFake();
    const completed = await openSession(stripe);
    stripe.markComplete(completed, 'sub_completed');
    const eventAt = new Date(createdMs);
    fakeNowMs = createdMs + 60_000;
    const later = await openSession(stripe);

    await sweep(stripe, completed, eventAt);

    expect(await statusOf(stripe, later)).toBe('open');
  });

  it('throws STRIPE_ERROR when the open Sessions cannot be listed', async () => {
    const stripe = createFake();
    stripe.setListHook(() => {
      throw new Error('list failed');
    });

    await expect(sweep(stripe, 'cs_completed')).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
    });
  });

  it('logs an error when more open Sessions exist than one page holds', async () => {
    const stripe = createFake();
    const completed = await openSession(stripe);
    stripe.markComplete(completed, 'sub_completed');
    for (let index = 0; index < 101; index += 1) {
      await openSession(stripe);
    }

    await sweep(stripe, completed);

    expect(logger.errorCalls).toContainEqual(
      expect.objectContaining({
        msg: 'More open checkout sessions than one page after a completion',
      }),
    );
  });
});
