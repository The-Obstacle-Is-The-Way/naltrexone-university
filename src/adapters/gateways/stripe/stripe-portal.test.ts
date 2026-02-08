import { describe, expect, it, vi } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createStripePortalSession } from './stripe-portal';

describe('createStripePortalSession', () => {
  it('retries transient failures even when idempotency key is omitted', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
      )
      .mockResolvedValueOnce({ url: 'https://stripe.test/portal' });

    const stripe = {
      billingPortal: {
        sessions: {
          create,
        },
      },
    } as unknown as Parameters<typeof createStripePortalSession>[0]['stripe'];

    await expect(
      createStripePortalSession({
        stripe,
        input: {
          externalCustomerId: 'cus_123',
          returnUrl: 'https://app.test/app/billing',
        },
        logger: new FakeLogger(),
      }),
    ).resolves.toEqual({ url: 'https://stripe.test/portal' });

    expect(create).toHaveBeenCalledTimes(2);
  });

  it('forwards idempotencyKey when provided', async () => {
    const create = vi.fn(async () => ({ url: 'https://stripe.test/portal' }));

    const stripe = {
      billingPortal: {
        sessions: {
          create,
        },
      },
    } as unknown as Parameters<typeof createStripePortalSession>[0]['stripe'];

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
    ).resolves.toEqual({ url: 'https://stripe.test/portal' });

    expect(create).toHaveBeenCalledWith(
      {
        customer: 'cus_123',
        return_url: 'https://app.test/app/billing',
      },
      { idempotencyKey: 'idem_123' },
    );
  });
});
