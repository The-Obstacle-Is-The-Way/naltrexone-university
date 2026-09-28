import { describe, expect, it } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  PORTAL_CONFIGURATION_VERSION,
  portalConfigurationParams,
  resolvePortalConfigurationId,
} from './stripe-portal-configurations';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

function appMetadata(profile: 'trial' | 'paid', version = '2026-09-28') {
  return { app_portal_profile: profile, app_portal_version: version };
}

function resolve(stripe: FakeStripeCheckoutClient, profile: 'trial' | 'paid') {
  return resolvePortalConfigurationId({
    stripe,
    profile,
    logger: new FakeLogger(),
  });
}

describe('portalConfigurationParams', () => {
  // A change here must bump PORTAL_CONFIGURATION_VERSION, so the adapter
  // creates a new configuration instead of reusing one with other features.
  it('pins both profiles to version 2026-09-28', () => {
    expect(PORTAL_CONFIGURATION_VERSION).toBe('2026-09-28');
    const shared = {
      customer_update: {
        enabled: true,
        allowed_updates: ['name', 'email', 'address', 'phone'],
      },
      invoice_history: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        proration_behavior: 'none',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'switched_service', 'unused', 'other'],
        },
      },
      subscription_update: { enabled: false },
    };

    expect(portalConfigurationParams('trial')).toEqual({
      features: { ...shared, payment_method_update: { enabled: false } },
      metadata: appMetadata('trial'),
    });
    expect(portalConfigurationParams('paid')).toEqual({
      features: { ...shared, payment_method_update: { enabled: true } },
      metadata: appMetadata('paid'),
    });
  });
});

describe('resolvePortalConfigurationId', () => {
  it('creates the profile configuration under a version-scoped key when none exists', async () => {
    const stripe = new FakeStripeCheckoutClient();

    const id = await resolve(stripe, 'trial');

    expect(stripe.portalConfigurations.createCalls).toEqual([
      {
        params: portalConfigurationParams('trial'),
        options: { idempotencyKey: 'portal_configuration:trial:2026-09-28' },
      },
    ]);
    const [created] = (
      await stripe.billingPortal.configurations.list({
        active: true,
        limit: 100,
      })
    ).data;
    expect(created?.id).toBe(id);
    expect(created?.features.payment_method_update.enabled).toBe(false);
  });

  it('reuses the active configuration for the profile and version', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const trial = stripe.portalConfigurations.seed({
      metadata: appMetadata('trial'),
    });
    const paid = stripe.portalConfigurations.seed({
      metadata: appMetadata('paid'),
    });

    await expect(resolve(stripe, 'trial')).resolves.toBe(trial);
    await expect(resolve(stripe, 'paid')).resolves.toBe(paid);
    expect(stripe.portalConfigurations.createCalls).toEqual([]);
  });

  it('ignores inactive, other-version and unmarked configurations', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.portalConfigurations.seed({
      active: false,
      metadata: appMetadata('trial'),
    });
    stripe.portalConfigurations.seed({
      metadata: appMetadata('trial', '2026-01-01'),
    });
    stripe.portalConfigurations.seed();

    const id = await resolve(stripe, 'trial');

    expect(stripe.portalConfigurations.createCalls).toHaveLength(1);
    expect(id).toBe('bpc_fake_4');
  });

  it('pages through every active configuration before creating one', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const wanted = stripe.portalConfigurations.seed({
      metadata: appMetadata('paid'),
    });
    for (let index = 0; index < 100; index += 1) {
      stripe.portalConfigurations.seed();
    }

    await expect(resolve(stripe, 'paid')).resolves.toBe(wanted);
    expect(stripe.portalConfigurations.listCalls).toHaveLength(2);
    expect(stripe.portalConfigurations.createCalls).toEqual([]);
  });

  it('picks the oldest match when concurrent first requests created two', async () => {
    let nowMs = Date.UTC(2026, 8, 28, 3, 0, 0);
    const stripe = new FakeStripeCheckoutClient(() => nowMs);
    const older = stripe.portalConfigurations.seed({
      metadata: appMetadata('paid'),
    });
    nowMs += 1_000;
    stripe.portalConfigurations.seed({ metadata: appMetadata('paid') });

    await expect(resolve(stripe, 'paid')).resolves.toBe(older);
  });
});
