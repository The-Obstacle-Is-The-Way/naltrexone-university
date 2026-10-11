import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NobleSha256Hasher } from '@/src/adapters/gateways/noble-sha256-hasher';
import { isE2EOwnerMismatchEvent } from '@/src/adapters/shared/stripe-subscription-errors';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { processStripeWebhookEvent } from './stripe-webhook-processor';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

const consentStateSecret = 'dedicated-consent-state-secret-32-bytes';
const appUserId = crypto.randomUUID();
const priceIds = { monthly: 'price_monthly', annual: 'price_annual' } as const;

// The fake hands the injected event back from webhook verification and
// records every SetupIntent and Subscription retrieval.
function stripeWithEvent(
  event: ReturnType<StripeClient['webhooks']['constructEvent']>,
): FakeStripeCheckoutClient {
  const stripe = new FakeStripeCheckoutClient();
  stripe.setWebhookEvent(event);
  return stripe;
}

function signedSetupMetadata() {
  const metadata = {
    consent_user_id: appUserId,
    consent_customer_id: 'cus_123',
    consent_subscription_id: 'sub_123',
    consent_plan: 'monthly',
    consent_amount_cents: '2900',
    consent_currency: 'usd',
    consent_frequency: 'month',
    consent_trial_ends_at: '2026-08-13T12:00:00.000Z',
    consent_disclosure_version: '2026-08-05',
    consent_terms_version: '2026-08-05',
    consent_terms_hash: 'terms-hash',
  };
  const sorted = Object.fromEntries(
    Object.entries(metadata).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  return {
    ...metadata,
    consent_state_signature: createHmac('sha256', consentStateSecret)
      .update(JSON.stringify(sorted))
      .digest('hex'),
  };
}

describe('expired trial payment-method setup webhook', () => {
  it('ignores a non-setup expired Checkout Session', async () => {
    const stripe = stripeWithEvent({
      id: 'evt_subscription_expired',
      type: 'checkout.session.expired',
      created: 1_775_649_600,
      data: {
        object: {
          id: 'cs_subscription_expired',
          mode: 'subscription',
          subscription: null,
          metadata: {},
        },
      },
    });

    const result = await processStripeWebhookEvent({
      stripe,
      webhookSecret: 'whsec_test',
      consentStateSecret,
      rawBody: '{}',
      signature: 'sig_test',
      priceIds,
      logger: new FakeLogger(),
      resolveCheckoutDisclosure: () => null,
      sha256Hasher: new NobleSha256Hasher(),
    });

    expect(result).toEqual({
      eventId: 'evt_subscription_expired',
      type: 'checkout.session.expired',
    });
    expect(result).not.toHaveProperty('trialPaymentMethodSetupExpiration');
  });

  it('normalizes signed state without retrieving a SetupIntent or subscription', async () => {
    const stripe = stripeWithEvent({
      id: 'evt_setup_expired',
      type: 'checkout.session.expired',
      created: 1_775_649_600,
      data: {
        object: {
          id: 'cs_setup_123',
          mode: 'setup',
          metadata: signedSetupMetadata(),
        },
      },
    });

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        consentStateSecret,
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger: new FakeLogger(),
        resolveCheckoutDisclosure: () => null,
        sha256Hasher: new NobleSha256Hasher(),
      }),
    ).resolves.toMatchObject({
      eventId: 'evt_setup_expired',
      type: 'checkout.session.expired',
      trialPaymentMethodSetupExpiration: {
        sessionId: 'cs_setup_123',
        userId: appUserId,
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        disclosureVersion: '2026-08-05',
        termsHash: 'terms-hash',
        expiredAt: new Date('2026-04-08T12:00:00.000Z'),
      },
    });
    expect(stripe.setupIntents.retrieveCalls).toEqual([]);
    expect(stripe.subscriptions.retrieveCalls).toEqual([]);
  });

  it('fails closed when the dedicated consent-state secret is unavailable', async () => {
    const stripe = stripeWithEvent({
      id: 'evt_setup_expired',
      type: 'checkout.session.expired',
      created: 1_775_649_600,
      data: {
        object: {
          id: 'cs_setup_123',
          mode: 'setup',
          metadata: signedSetupMetadata(),
        },
      },
    });

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger: new FakeLogger(),
        resolveCheckoutDisclosure: () => null,
        sha256Hasher: new NobleSha256Hasher(),
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Trial consent-state verification is not configured',
    });
  });

  it('rejects an expired setup Session with incomplete signed state', async () => {
    const logger = new FakeLogger();
    const stripe = stripeWithEvent({
      id: 'evt_setup_expired',
      type: 'checkout.session.expired',
      created: 1_775_649_600,
      data: {
        object: {
          id: 'cs_setup_123',
          mode: 'setup',
          metadata: {},
        },
      },
    });

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        consentStateSecret,
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger,
        resolveCheckoutDisclosure: () => null,
        sha256Hasher: new NobleSha256Hasher(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
    expect(logger.errorCalls).toEqual([
      expect.objectContaining({
        msg: 'Invalid expired Stripe trial payment-method setup Session',
      }),
    ]);
  });

  it('rejects an expired setup Session with a forged state signature', async () => {
    const stripe = stripeWithEvent({
      id: 'evt_setup_expired',
      type: 'checkout.session.expired',
      created: 1_775_649_600,
      data: {
        object: {
          id: 'cs_setup_123',
          mode: 'setup',
          metadata: {
            ...signedSetupMetadata(),
            consent_state_signature: '0'.repeat(64),
          },
        },
      },
    });

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        consentStateSecret,
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger: new FakeLogger(),
        resolveCheckoutDisclosure: () => null,
        sha256Hasher: new NobleSha256Hasher(),
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_PAYLOAD',
      message: 'Invalid expired trial payment-method setup state signature',
    });
  });

  // GitHub #883: a webhook with an E2E owner shares its Stripe test account
  // with other environments, whose add-card Sessions are signed with their own
  // consent-state secrets. Those are skipped like another owner's subscription
  // events. Nothing is written either way.
  it('skips an expired setup Session signed in another environment when this webhook has an E2E owner', async () => {
    const stripe = stripeWithEvent({
      id: 'evt_setup_expired',
      type: 'checkout.session.expired',
      created: 1_775_649_600,
      data: {
        object: {
          id: 'cs_setup_123',
          mode: 'setup',
          metadata: {
            ...signedSetupMetadata(),
            consent_state_signature: '0'.repeat(64),
          },
        },
      },
    });

    const error = await processStripeWebhookEvent({
      stripe,
      webhookSecret: 'whsec_test',
      consentStateSecret,
      rawBody: '{}',
      signature: 'sig_test',
      priceIds,
      logger: new FakeLogger(),
      resolveCheckoutDisclosure: () => null,
      sha256Hasher: new NobleSha256Hasher(),
      webhookE2EOwner: 'preview-owner',
    }).catch((caught: unknown) => caught);

    expect(isE2EOwnerMismatchEvent(error)).toBe(true);
    expect(error).toMatchObject({
      fieldErrors: { consent_state_signature: ['foreign_environment'] },
    });
    expect(stripe.subscriptions.retrieveCalls).toEqual([]);
  });

  it('normalizes its own signed setup Session when this webhook has an E2E owner', async () => {
    const stripe = stripeWithEvent({
      id: 'evt_setup_expired',
      type: 'checkout.session.expired',
      created: 1_775_649_600,
      data: {
        object: {
          id: 'cs_setup_123',
          mode: 'setup',
          metadata: signedSetupMetadata(),
        },
      },
    });

    await expect(
      processStripeWebhookEvent({
        stripe,
        webhookSecret: 'whsec_test',
        consentStateSecret,
        rawBody: '{}',
        signature: 'sig_test',
        priceIds,
        logger: new FakeLogger(),
        resolveCheckoutDisclosure: () => null,
        sha256Hasher: new NobleSha256Hasher(),
        webhookE2EOwner: 'preview-owner',
      }),
    ).resolves.toMatchObject({
      trialPaymentMethodSetupExpiration: { sessionId: 'cs_setup_123' },
    });
  });
});
