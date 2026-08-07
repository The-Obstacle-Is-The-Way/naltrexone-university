import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { processStripeWebhookEvent } from './stripe-webhook-processor';

const consentStateSecret = 'dedicated-consent-state-secret-32-bytes';
const appUserId = crypto.randomUUID();
const priceIds = { monthly: 'price_monthly', annual: 'price_annual' } as const;

function createStripeClient(input: {
  event: ReturnType<StripeClient['webhooks']['constructEvent']>;
  retrieveSetupIntent?: NonNullable<StripeClient['setupIntents']>['retrieve'];
  retrieveSubscription?: NonNullable<StripeClient['subscriptions']>['retrieve'];
}): StripeClient {
  return {
    customers: {
      create: vi.fn(async () => ({ id: 'cus_unused' })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: 'cs_unused', url: null })),
        list: vi.fn(async () => ({ data: [] })),
        retrieve: vi.fn(async () => ({ id: 'cs_unused', url: null })),
        expire: vi.fn(async () => ({ id: 'cs_unused', url: null })),
      },
    },
    subscriptions: {
      retrieve: input.retrieveSubscription ?? vi.fn(async () => ({})),
    },
    setupIntents: {
      retrieve:
        input.retrieveSetupIntent ?? vi.fn(async () => ({ id: 'seti_unused' })),
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: 'https://stripe.test/portal' })),
      },
    },
    webhooks: {
      constructEvent: vi.fn(() => input.event),
    },
  };
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
  it('normalizes signed state without retrieving a SetupIntent or subscription', async () => {
    const retrieveSetupIntent = vi.fn();
    const retrieveSubscription = vi.fn();
    const stripe = createStripeClient({
      event: {
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
      },
      retrieveSetupIntent,
      retrieveSubscription,
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
    expect(retrieveSetupIntent).not.toHaveBeenCalled();
    expect(retrieveSubscription).not.toHaveBeenCalled();
  });

  it('fails closed when the dedicated consent-state secret is unavailable', async () => {
    const stripe = createStripeClient({
      event: {
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
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Trial consent-state verification is not configured',
    });
  });

  it('rejects an expired setup Session with incomplete signed state', async () => {
    const logger = new FakeLogger();
    const stripe = createStripeClient({
      event: {
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
      }),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
    expect(logger.errorCalls).toEqual([
      expect.objectContaining({
        msg: 'Invalid expired Stripe trial payment-method setup Session',
      }),
    ]);
  });

  it('rejects an expired setup Session with a forged state signature', async () => {
    const stripe = createStripeClient({
      event: {
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
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_PAYLOAD',
      message: 'Invalid expired trial payment-method setup state signature',
    });
  });
});
