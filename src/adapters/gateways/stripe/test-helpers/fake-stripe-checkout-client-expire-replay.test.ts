import { describe, expect, it } from 'vitest';
import type { CheckoutSessionCreateParams } from '@/src/adapters/shared/stripe-types';
import { FakeStripeCheckoutClient } from './fake-stripe-checkout-client';

const setupParams = {
  mode: 'setup',
  currency: 'usd',
  success_url: 'https://app.example.com/success',
  cancel_url: 'https://app.example.com/cancel',
} satisfies CheckoutSessionCreateParams;

// Stripe saves the first answer an endpoint gives under an idempotency key,
// server errors included, and replays it to later requests with that key
// (API reference, "Idempotent requests"). TEST mode cannot be made to answer
// 500, so these cases, not the shared contract, pin how the fake models it.
describe('FakeStripeCheckoutClient saved expire failures', () => {
  it('replays a server error an expire was answered with to a later expire under the same idempotency key', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const created = await stripe.checkout.sessions.create(setupParams, {
      idempotencyKey: 'key_expire_saved_failure',
    });
    const serverError = Object.assign(new Error('An unknown error occurred'), {
      type: 'StripeAPIError',
      statusCode: 500,
    });
    stripe.setExpireFault(() => {
      throw serverError;
    });
    const keyed = { idempotencyKey: 'expire_under_one_key' };
    await expect(
      stripe.checkout.sessions.expire(created.id, undefined, keyed),
    ).rejects.toBe(serverError);
    // A second server error under the key does not replace the first answer.
    stripe.setExpireFault(() => {
      throw Object.assign(new Error('Service unavailable'), {
        type: 'StripeAPIError',
        statusCode: 503,
      });
    });
    await expect(
      stripe.checkout.sessions.expire(created.id, undefined, keyed),
    ).rejects.toThrow('Service unavailable');
    stripe.setExpireFault(null);

    await expect(
      stripe.checkout.sessions.expire(created.id, undefined, keyed),
    ).rejects.toBe(serverError);
    await expect(
      stripe.checkout.sessions.retrieve(created.id),
    ).resolves.toEqual(expect.objectContaining({ status: 'open' }));

    await expect(stripe.checkout.sessions.expire(created.id)).resolves.toEqual(
      expect.objectContaining({ status: 'expired' }),
    );
  });

  it('keeps the first answer saved under a key when a later fault throws a server error', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const created = await stripe.checkout.sessions.create(setupParams, {
      idempotencyKey: 'key_expire_first_answer',
    });
    const keyed = { idempotencyKey: 'expire_under_one_key' };
    await stripe.checkout.sessions.expire(created.id, undefined, keyed);
    stripe.setExpireFault(() => {
      throw Object.assign(new Error('An unknown error occurred'), {
        type: 'StripeAPIError',
        statusCode: 500,
      });
    });
    await expect(
      stripe.checkout.sessions.expire(created.id, undefined, keyed),
    ).rejects.toThrow('An unknown error occurred');
    stripe.setExpireFault(null);

    await expect(
      stripe.checkout.sessions.expire(created.id, undefined, keyed),
    ).resolves.toEqual(expect.objectContaining({ status: 'expired' }));
  });

  it('saves nothing for an expire fault that carries no server status', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const created = await stripe.checkout.sessions.create(setupParams, {
      idempotencyKey: 'key_expire_unsaved_failure',
    });
    stripe.setExpireFault(() => {
      throw new Error('expire transport failed');
    });
    const keyed = { idempotencyKey: 'expire_under_one_key' };
    await expect(
      stripe.checkout.sessions.expire(created.id, undefined, keyed),
    ).rejects.toThrow('expire transport failed');
    stripe.setExpireFault(null);

    await expect(
      stripe.checkout.sessions.expire(created.id, undefined, keyed),
    ).resolves.toEqual(expect.objectContaining({ status: 'expired' }));
  });
});
