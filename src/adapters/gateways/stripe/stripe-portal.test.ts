import { describe, expect, it, vi } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createStripePortalSession } from './stripe-portal';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

describe('createStripePortalSession', () => {
  it('retries transient failures even when idempotency key is omitted', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const create = vi
      .spyOn(stripe.billingPortal.sessions, 'create')
      .mockRejectedValueOnce(
        Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
      );

    await expect(
      createStripePortalSession({
        stripe,
        input: {
          externalCustomerId: 'cus_123',
          returnUrl: 'https://app.test/app/billing',
        },
        logger: new FakeLogger(),
      }),
    ).resolves.toEqual({ url: 'https://billing.stripe.test/session' });

    expect(create).toHaveBeenCalledTimes(2);
  });

  it('forwards idempotencyKey when provided', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const create = vi.spyOn(stripe.billingPortal.sessions, 'create');

    await expect(
      createStripePortalSession({
        stripe,
        input: {
          externalCustomerId: 'cus_123',
          returnUrl: 'https://app.test/app/billing',
        },
        options: {
          idempotencyKey: 'idem_123',
        },
        logger: new FakeLogger(),
      }),
    ).resolves.toEqual({ url: 'https://billing.stripe.test/session' });

    expect(create).toHaveBeenCalledWith(
      {
        customer: 'cus_123',
        return_url: 'https://app.test/app/billing',
      },
      { idempotencyKey: 'idem_123' },
    );
  });
});
