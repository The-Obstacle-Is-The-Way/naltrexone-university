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
          profile: 'paid',
        },
        logger: new FakeLogger(),
      }),
    ).resolves.toEqual({ url: 'https://billing.stripe.test/session' });

    expect(create).toHaveBeenCalledTimes(2);
  });

  it('forwards idempotencyKey when provided', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const paid = stripe.portalConfigurations.seed({
      metadata: {
        app_portal_profile: 'paid',
        app_portal_version: '2026-09-28',
      },
    });
    const create = vi.spyOn(stripe.billingPortal.sessions, 'create');

    await expect(
      createStripePortalSession({
        stripe,
        input: {
          externalCustomerId: 'cus_123',
          returnUrl: 'https://app.test/app/billing',
          profile: 'paid',
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
        configuration: paid,
      },
      { idempotencyKey: 'idem_123' },
    );
  });

  // DEBT-414 F05: a trial's session uses the configuration without
  // payment-method updates, never the Dashboard's default.
  it("opens a trial's session with the trial configuration", async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.portalConfigurations.seed({
      metadata: {
        app_portal_profile: 'paid',
        app_portal_version: '2026-09-28',
      },
    });
    const create = vi.spyOn(stripe.billingPortal.sessions, 'create');

    await createStripePortalSession({
      stripe,
      input: {
        externalCustomerId: 'cus_123',
        returnUrl: 'https://app.test/app/billing',
        profile: 'trial',
      },
      logger: new FakeLogger(),
    });

    const [created] = (
      await stripe.billingPortal.configurations.list({
        active: true,
        limit: 100,
      })
    ).data.filter(
      (configuration) => configuration.metadata?.app_portal_profile === 'trial',
    );
    expect(created?.features.payment_method_update.enabled).toBe(false);
    expect(create).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://app.test/app/billing',
      configuration: created?.id,
    });
  });
});
