import { describe, expect, it } from 'vitest';
import type { CheckoutSessionCreateParams } from '@/src/adapters/shared/stripe-types';
import { FakeStripeCheckoutClient } from './fake-stripe-checkout-client';

const setupParams = {
  mode: 'setup',
  currency: 'usd',
  success_url: 'https://app.example.com/success',
  cancel_url: 'https://app.example.com/cancel',
} satisfies CheckoutSessionCreateParams;

const subscriptionParams = {
  mode: 'subscription',
  customer: 'cus_test',
  line_items: [{ price: 'price_monthly', quantity: 1 }],
  success_url: 'https://app.example.com/success',
  cancel_url: 'https://app.example.com/cancel',
} satisfies CheckoutSessionCreateParams;

const modeParams = [
  ['setup', setupParams],
  ['subscription', subscriptionParams],
] as const;

describe('FakeStripeCheckoutClient', () => {
  it.each(modeParams)(
    'creates open %s Checkout Sessions',
    async (mode, params) => {
      const stripe = new FakeStripeCheckoutClient();

      const session = await stripe.checkout.sessions.create(params, {
        idempotencyKey: `key_${mode}`,
      });

      expect(session).toMatchObject({
        mode,
        status: 'open',
        url: expect.any(String),
        expires_at: expect.any(Number),
      });
    },
  );

  it('omits payment_method_collection when subscription params do not set it', async () => {
    const stripe = new FakeStripeCheckoutClient();

    const session = await stripe.checkout.sessions.create(subscriptionParams, {
      idempotencyKey: 'key_subscription',
    });

    expect(session).not.toHaveProperty('payment_method_collection');
  });

  it.each(modeParams)(
    'replays the frozen first %s response while retrieve exposes completed live state',
    async (mode, params) => {
      const stripe = new FakeStripeCheckoutClient();
      const options = { idempotencyKey: `key_${mode}` };
      const first = await stripe.checkout.sessions.create(params, options);

      stripe.markComplete(first.id);

      await expect(
        stripe.checkout.sessions.create(params, options),
      ).resolves.toEqual(first);
      await expect(
        stripe.checkout.sessions.retrieve(first.id),
      ).resolves.toEqual(
        expect.objectContaining({
          id: first.id,
          status: 'complete',
          url: null,
        }),
      );
    },
  );

  it.each(modeParams)(
    'marks only the mutable live %s snapshot expired',
    async (mode, params) => {
      const stripe = new FakeStripeCheckoutClient();
      const options = { idempotencyKey: `key_${mode}` };
      const first = await stripe.checkout.sessions.create(params, options);

      stripe.markExpired(first.id);

      await expect(
        stripe.checkout.sessions.retrieve(first.id),
      ).resolves.toEqual(
        expect.objectContaining({
          id: first.id,
          status: 'expired',
          url: null,
        }),
      );
      await expect(
        stripe.checkout.sessions.create(params, options),
      ).resolves.toEqual(first);
    },
  );

  it('supports explicit retrieve fault injection without changing the saved response', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const options = { idempotencyKey: 'key_setup' };
    const first = await stripe.checkout.sessions.create(setupParams, options);
    stripe.setRetrieveOverride((session) => ({
      ...session,
      id: 'cs_mismatched',
    }));

    await expect(stripe.checkout.sessions.retrieve(first.id)).resolves.toEqual(
      expect.objectContaining({ id: 'cs_mismatched' }),
    );
    await expect(
      stripe.checkout.sessions.create(setupParams, options),
    ).resolves.toEqual(first);
  });

  it('lists terminal and open Sessions in reverse chronology with cursor pagination', async () => {
    let nowMs = Date.UTC(2026, 7, 17, 12, 0, 0);
    const stripe = new FakeStripeCheckoutClient(() => nowMs);
    const first = await stripe.checkout.sessions.create(subscriptionParams, {
      idempotencyKey: 'key_first',
    });
    stripe.markComplete(first.id);
    nowMs += 1_000;
    const second = await stripe.checkout.sessions.create(subscriptionParams, {
      idempotencyKey: 'key_second',
    });
    stripe.markExpired(second.id);
    nowMs += 1_000;
    const third = await stripe.checkout.sessions.create(subscriptionParams, {
      idempotencyKey: 'key_third',
    });
    const list = stripe.checkout.sessions.list as unknown as (params: {
      customer: string;
      limit: number;
      starting_after?: string;
    }) => Promise<{
      data: Array<{ id: string; status?: string | null }>;
      has_more: boolean;
    }>;

    const firstPage = await list({ customer: 'cus_test', limit: 2 });
    const secondPage = await list({
      customer: 'cus_test',
      limit: 2,
      starting_after: second.id,
    });

    expect(firstPage).toMatchObject({
      data: [
        { id: third.id, status: 'open' },
        { id: second.id, status: 'expired' },
      ],
      has_more: true,
    });
    expect(secondPage).toMatchObject({
      data: [{ id: first.id, status: 'complete' }],
      has_more: false,
    });
  });

  it('rejects reuse of an idempotency key with different create parameters', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const options = { idempotencyKey: 'key_subscription' };
    await stripe.checkout.sessions.create(subscriptionParams, options);

    const action = stripe.checkout.sessions.create(
      {
        ...subscriptionParams,
        success_url: 'https://app.example.com/a-different-success',
      },
      options,
    );

    await expect(action).rejects.toMatchObject({
      rawType: 'idempotency_error',
      statusCode: 400,
    });
  });
});
