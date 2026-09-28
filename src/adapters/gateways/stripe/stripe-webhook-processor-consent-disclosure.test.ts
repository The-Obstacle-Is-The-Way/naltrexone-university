import { describe, expect, it } from 'vitest';
import { resolveCheckoutDisclosure } from '@/lib/checkout-disclosures';
import { NobleSha256Hasher } from '@/src/adapters/gateways/noble-sha256-hasher';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { processStripeWebhookEvent } from './stripe-webhook-processor';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

const appUserId = crypto.randomUUID();
const priceIds = { monthly: 'price_monthly', annual: 'price_annual' } as const;
const sha256Hasher = new NobleSha256Hasher();

// DEBT-414 F15: a session carries a registered consent text by disclosure
// version and SHA-256 instead of verbatim. The production registry supplies it.
const REGISTERED_VERSION = '2026-09-16';

function registeredText(plan: 'monthly' | 'annual', hasTrial: boolean) {
  const text = resolveCheckoutDisclosure({
    disclosureVersion: REGISTERED_VERSION,
    plan,
    hasTrial,
  });
  if (text === null) throw new Error('Expected a registered consent text.');
  return text;
}

const verbatimMetadata = {
  checkout_variant: 'standard',
  renewal_user_id: appUserId,
  renewal_plan: 'monthly',
  renewal_amount_cents: '2900',
  renewal_currency: 'usd',
  renewal_frequency: 'month',
  renewal_disclosure_snapshot: 'Exact immediate disclosure.',
  renewal_disclosure_version: '2026-08-05',
  renewal_terms_version: '2026-08-05',
  renewal_terms_hash: 'terms-hash',
  renewal_cancellation_method:
    'Billing page in the app or support@addictionboards.com',
};

function processConsentCheckout(
  sessionId: string,
  metadata: Record<string, string>,
  logger: FakeLogger = new FakeLogger(),
  plan: 'monthly' | 'annual' = 'monthly',
) {
  const stripe = new FakeStripeCheckoutClient();
  stripe.setWebhookEvent({
    id: `evt_${sessionId}`,
    type: 'checkout.session.completed',
    created: 1_775_649_600,
    data: {
      object: {
        id: sessionId,
        mode: 'subscription',
        customer: 'cus_123',
        client_reference_id: appUserId,
        subscription: 'sub_123',
        consent: { terms_of_service: 'accepted' },
        metadata,
      },
    },
  });
  stripe.seedSubscription({
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    start_date: 1_696_000_000,
    billing_cycle_anchor: 1_696_604_800,
    metadata: { user_id: appUserId },
    items: {
      data: [
        { current_period_end: 1_800_000_000, price: { id: priceIds[plan] } },
      ],
    },
  });
  return processStripeWebhookEvent({
    stripe,
    webhookSecret: 'whsec_test',
    rawBody: '{}',
    signature: 'sig_test',
    priceIds,
    logger,
    resolveCheckoutDisclosure,
    sha256Hasher,
  });
}

// A consent text longer than Stripe's 500-character metadata limit travels as
// its disclosure version and SHA-256; the webhook rebuilds and verifies it.
describe('processStripeWebhookEvent hash-carried consent text', () => {
  const { renewal_disclosure_snapshot: _verbatim, ...withoutText } =
    verbatimMetadata;
  const hashCarried = {
    ...withoutText,
    renewal_disclosure_version: REGISTERED_VERSION,
    renewal_disclosure_hash: sha256Hasher.hash(
      registeredText('monthly', false),
    ),
  };

  it.each([
    { plan: 'monthly', frequency: 'month', hasTrial: false },
    { plan: 'monthly', frequency: 'month', hasTrial: true },
    { plan: 'annual', frequency: 'year', hasTrial: false },
    { plan: 'annual', frequency: 'year', hasTrial: true },
  ] as const)(
    'records the registered $plan text the hash verifies (trial: $hasTrial)',
    async ({ plan, frequency, hasTrial }) => {
      const text = registeredText(plan, hasTrial);

      await expect(
        processConsentCheckout(
          'cs_checkout_hashed',
          {
            ...hashCarried,
            checkout_variant: hasTrial ? 'trial:7' : 'standard',
            renewal_plan: plan,
            renewal_frequency: frequency,
            renewal_disclosure_hash: sha256Hasher.hash(text),
          },
          new FakeLogger(),
          plan,
        ),
      ).resolves.toMatchObject({
        initialSubscriptionConsent: {
          checkoutSessionId: 'cs_checkout_hashed',
          disclosureSnapshot: text,
          disclosureVersion: REGISTERED_VERSION,
        },
      });
    },
  );

  it('still records a text carried verbatim', async () => {
    await expect(
      processConsentCheckout('cs_checkout_verbatim', verbatimMetadata),
    ).resolves.toMatchObject({
      initialSubscriptionConsent: {
        disclosureSnapshot: 'Exact immediate disclosure.',
      },
    });
  });

  it.each([
    {
      name: 'the hash does not match the registered text',
      metadata: {
        ...hashCarried,
        renewal_disclosure_hash: sha256Hasher.hash('Other text.'),
      },
    },
    {
      name: 'the version has no registered text',
      metadata: { ...hashCarried, renewal_disclosure_version: '2026-01-01' },
    },
    {
      name: 'the hash is of the text for the other checkout variant',
      metadata: { ...hashCarried, checkout_variant: 'trial:7' },
    },
    {
      name: 'the hash is of the text for the other plan',
      metadata: {
        ...hashCarried,
        renewal_disclosure_hash: sha256Hasher.hash(
          registeredText('annual', false),
        ),
      },
    },
  ])('records no consent and warns when $name', async ({ metadata }) => {
    const logger = new FakeLogger();

    const result = await processConsentCheckout(
      'cs_checkout_unverified',
      metadata,
      logger,
    );

    expect(result).not.toHaveProperty('initialSubscriptionConsent');
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({
          sessionId: 'cs_checkout_unverified',
          reason: 'consent_disclosure_unverified',
        }),
      }),
    ]);
  });

  it.each([
    {
      name: 'carries both the text and a hash',
      metadata: {
        ...verbatimMetadata,
        renewal_disclosure_hash: sha256Hasher.hash(
          'Exact immediate disclosure.',
        ),
      },
    },
    {
      name: 'carries neither the text nor a hash',
      metadata: withoutText,
    },
    {
      name: 'carries a hash that is not a SHA-256 digest',
      metadata: { ...hashCarried, renewal_disclosure_hash: 'not-a-digest' },
    },
  ])('rejects consent evidence that $name', async ({ metadata }) => {
    const logger = new FakeLogger();

    const result = await processConsentCheckout(
      'cs_checkout_ambiguous',
      metadata,
      logger,
    );

    expect(result).not.toHaveProperty('initialSubscriptionConsent');
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({
          reason: 'consent_evidence_invalid',
        }),
      }),
    ]);
  });
});
