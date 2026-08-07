import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { processStripeWebhookEvent } from './stripe-webhook-processor';

const consentStateSecret = 'dedicated-consent-state-secret-32-bytes';
const appUserId = crypto.randomUUID();
const priceIds = { monthly: 'price_monthly', annual: 'price_annual' } as const;

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
    const stripe = {
      webhooks: {
        constructEvent: vi.fn(() => ({
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
        })),
      },
      setupIntents: { retrieve: retrieveSetupIntent },
      subscriptions: { retrieve: retrieveSubscription },
    } as unknown as StripeClient;

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
});
