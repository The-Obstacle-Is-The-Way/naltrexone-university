import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NobleSha256Hasher } from '@/src/adapters/gateways/noble-sha256-hasher';
import { isE2EOwnerMismatchEvent } from '@/src/adapters/shared/stripe-subscription-errors';
import type { StripeSetupIntent } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { processStripeWebhookEvent } from './stripe-webhook-processor';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

const appUserId = crypto.randomUUID();
const consentStateSecret = 'dedicated-consent-state-secret-32-bytes';
const priceIds = { monthly: 'price_monthly', annual: 'price_annual' } as const;

type WebhookEvent = Parameters<FakeStripeCheckoutClient['setWebhookEvent']>[0] &
  object;

// What Stripe returns for a completed card setup, retrieved with its
// payment method expanded.
const savedCard: StripeSetupIntent = {
  id: 'seti_123',
  status: 'succeeded',
  payment_method: { id: 'pm_123', type: 'card' },
};

// The fake hands back the injected event (recording the verification call)
// and serves seeded SetupIntents by id.
function createStripe(event: WebhookEvent): FakeStripeCheckoutClient {
  const stripe = new FakeStripeCheckoutClient();
  stripe.setWebhookEvent(event);
  return stripe;
}

function processEvent(
  stripe: FakeStripeCheckoutClient,
  overrides: {
    logger?: FakeLogger;
    consentStateSecret?: string;
    webhookE2EOwner?: string;
  } = {},
) {
  return processStripeWebhookEvent({
    stripe,
    webhookSecret: 'whsec_test',
    ...(overrides.consentStateSecret
      ? { consentStateSecret: overrides.consentStateSecret }
      : {}),
    ...(overrides.webhookE2EOwner
      ? { webhookE2EOwner: overrides.webhookE2EOwner }
      : {}),
    rawBody: '{}',
    signature: 'sig_test',
    priceIds,
    logger: overrides.logger ?? new FakeLogger(),
    resolveCheckoutDisclosure: () => null,
    sha256Hasher: new NobleSha256Hasher(),
  });
}

function signSetupMetadata(metadata: Record<string, string>): string {
  const sorted = Object.fromEntries(
    Object.entries(metadata).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  return createHmac('sha256', consentStateSecret)
    .update(JSON.stringify(sorted))
    .digest('hex');
}

function createCompletedSetupSession(overrides?: {
  terms?: 'accepted' | 'required';
  signature?: string;
  customerId?: string;
}) {
  const metadata = {
    consent_user_id: appUserId,
    consent_customer_id: overrides?.customerId ?? 'cus_123',
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
  return {
    id: 'cs_setup_123',
    mode: 'setup',
    setup_intent: 'seti_123',
    consent: { terms_of_service: overrides?.terms ?? 'accepted' },
    metadata: {
      ...metadata,
      consent_state_signature:
        overrides?.signature ?? signSetupMetadata(metadata),
    },
  };
}

function setupCompletionEvent(
  session: ReturnType<typeof createCompletedSetupSession>,
  created?: number,
): WebhookEvent {
  return {
    id: 'evt_setup',
    type: 'checkout.session.completed',
    ...(created === undefined ? {} : { created }),
    data: { object: session },
  };
}

describe('trial payment-method setup completion webhook', () => {
  it('normalizes an accepted, signed setup completion and resolves its card', async () => {
    const stripe = createStripe(
      setupCompletionEvent(createCompletedSetupSession(), 1_775_649_600),
    );
    stripe.seedSetupIntent(savedCard);

    await expect(processEvent(stripe, { consentStateSecret })).resolves.toEqual(
      {
        eventId: 'evt_setup',
        type: 'checkout.session.completed',
        trialPaymentMethodSetupCompletion: {
          sessionId: 'cs_setup_123',
          userId: appUserId,
          externalCustomerId: 'cus_123',
          externalSubscriptionId: 'sub_123',
          plan: 'monthly',
          amountCents: 2900,
          currency: 'usd',
          frequency: 'month',
          trialEndsAt: new Date('2026-08-13T12:00:00.000Z'),
          disclosureVersion: '2026-08-05',
          termsVersion: '2026-08-05',
          termsHash: 'terms-hash',
          stripePaymentMethodId: 'pm_123',
          acceptedAt: new Date('2026-04-08T12:00:00.000Z'),
        },
      },
    );
    // BUG-310: the payment method is expanded so its type can be checked.
    expect(stripe.setupIntents.retrieveRequests).toEqual([
      { setupIntentId: 'seti_123', params: { expand: ['payment_method'] } },
    ]);
    expect(stripe.subscriptions.retrieveCalls).toEqual([]);
    expect(stripe.webhookCalls).toEqual([
      { rawBody: '{}', signature: 'sig_test', secret: 'whsec_test' },
    ]);
  });

  it('fails a setup completion closed when the dedicated consent-state secret is unavailable', async () => {
    const stripe = createStripe(
      setupCompletionEvent(createCompletedSetupSession()),
    );

    await expect(processEvent(stripe)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Trial consent-state verification is not configured',
    });
  });

  it('rejects a setup completion without accepted Terms before resolving the payment method', async () => {
    const stripe = createStripe(
      setupCompletionEvent(createCompletedSetupSession({ terms: 'required' })),
    );
    stripe.seedSetupIntent(savedCard);

    await expect(
      processEvent(stripe, { consentStateSecret }),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
    expect(stripe.setupIntents.retrieveCalls).toEqual([]);
  });

  it('rejects setup metadata with an invalid server signature before resolving the payment method', async () => {
    // A well-formed but wrong signature: the metadata schema accepts it, so
    // the server-side HMAC check is what rejects the Session.
    const stripe = createStripe(
      setupCompletionEvent(
        createCompletedSetupSession({ signature: '0'.repeat(64) }),
      ),
    );
    stripe.seedSetupIntent(savedCard);

    await expect(
      processEvent(stripe, { consentStateSecret }),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
    expect(stripe.setupIntents.retrieveCalls).toEqual([]);
  });

  // GitHub #883: a webhook with an E2E owner shares its Stripe test account
  // with other environments, whose add-card Sessions are signed with their own
  // consent-state secrets. Such a Session is skipped like another owner's
  // subscription event when its Customer carries another e2e_owner, or is gone:
  // E2E teardown deletes its Customers, and with the Customer gone nothing here
  // is left to act on. A live Customer without that evidence keeps it an
  // invalid payload, so a misconfigured secret on this deployment is still
  // reported. No payment method is resolved either way.
  function unverifiableCompletion(customerMetadata: Record<string, string>) {
    const stripe = new FakeStripeCheckoutClient();
    const customerId = stripe.seedCustomer(customerMetadata);
    stripe.setWebhookEvent(
      setupCompletionEvent(
        createCompletedSetupSession({ signature: '0'.repeat(64), customerId }),
      ),
    );
    stripe.seedSetupIntent(savedCard);
    return { stripe, customerId };
  }

  it('skips an unverifiable setup completion whose Customer belongs to another E2E owner', async () => {
    const { stripe, customerId } = unverifiableCompletion({
      e2e_owner: 'other-owner',
    });

    const error = await processEvent(stripe, {
      consentStateSecret,
      webhookE2EOwner: 'preview-owner',
    }).catch((caught: unknown) => caught);

    expect(isE2EOwnerMismatchEvent(error)).toBe(true);
    expect(error).toMatchObject({
      fieldErrors: { consent_state_signature: ['foreign_environment'] },
    });
    expect(stripe.customers.retrieveCalls).toEqual([customerId]);
    expect(stripe.setupIntents.retrieveCalls).toEqual([]);
  });

  it.each([
    ["this webhook's E2E owner", { e2e_owner: 'preview-owner' }],
    ['no E2E owner', {}],
  ])(
    'rejects an unverifiable setup completion as an invalid payload when its Customer carries %s',
    async (_label, customerMetadata) => {
      const { stripe } = unverifiableCompletion(customerMetadata);

      await expect(
        processEvent(stripe, {
          consentStateSecret,
          webhookE2EOwner: 'preview-owner',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
      expect(stripe.setupIntents.retrieveCalls).toEqual([]);
    },
  );

  it('skips an unverifiable setup completion whose Customer was deleted', async () => {
    const { stripe, customerId } = unverifiableCompletion({});
    stripe.deleteCustomer(customerId);

    const error = await processEvent(stripe, {
      consentStateSecret,
      webhookE2EOwner: 'preview-owner',
    }).catch((caught: unknown) => caught);

    expect(isE2EOwnerMismatchEvent(error)).toBe(true);
    expect(error).toMatchObject({
      fieldErrors: { consent_state_signature: ['customer_gone'] },
    });
    expect(stripe.customers.retrieveCalls).toEqual([customerId]);
    expect(stripe.setupIntents.retrieveCalls).toEqual([]);
  });

  it('skips an unverifiable setup completion when Stripe holds no such Customer', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.setWebhookEvent(
      setupCompletionEvent(
        createCompletedSetupSession({
          signature: '0'.repeat(64),
          customerId: 'cus_unknown',
        }),
      ),
    );
    stripe.seedSetupIntent(savedCard);

    const error = await processEvent(stripe, {
      consentStateSecret,
      webhookE2EOwner: 'preview-owner',
    }).catch((caught: unknown) => caught);

    expect(isE2EOwnerMismatchEvent(error)).toBe(true);
    expect(error).toMatchObject({
      fieldErrors: { consent_state_signature: ['customer_gone'] },
    });
    expect(stripe.customers.retrieveCalls).toEqual(['cus_unknown']);
    expect(stripe.setupIntents.retrieveCalls).toEqual([]);
  });

  it('resolves its own signed setup completion when this webhook has an E2E owner', async () => {
    const stripe = createStripe(
      setupCompletionEvent(createCompletedSetupSession(), 1_775_649_600),
    );
    stripe.seedSetupIntent(savedCard);

    await expect(
      processEvent(stripe, {
        consentStateSecret,
        webhookE2EOwner: 'preview-owner',
      }),
    ).resolves.toMatchObject({
      trialPaymentMethodSetupCompletion: { sessionId: 'cs_setup_123' },
    });
    expect(stripe.setupIntents.retrieveCalls).toEqual(['seti_123']);
    expect(stripe.customers.retrieveCalls).toEqual([]);
  });

  // BUG-310: only a card that Stripe saved becomes the trial's renewal
  // method. Anything else fails the event with a logged error before any
  // write, so nothing is attached or recorded; the route answers 400 and
  // Stripe shows the delivery as failed.
  it.each([
    [
      'a SetupIntent that has not succeeded',
      { ...savedCard, status: 'requires_action' },
      { setupIntentStatus: 'requires_action', paymentMethodType: 'card' },
    ],
    [
      'a payment method that is not a card',
      { ...savedCard, payment_method: { id: 'pm_123', type: 'klarna' } },
      { setupIntentStatus: 'succeeded', paymentMethodType: 'klarna' },
    ],
    [
      'a payment method whose type was not returned',
      { ...savedCard, payment_method: 'pm_123' },
      { setupIntentStatus: 'succeeded', paymentMethodType: undefined },
    ],
    [
      'a SetupIntent without a payment method',
      { ...savedCard, payment_method: null },
      { setupIntentStatus: 'succeeded', paymentMethodType: undefined },
    ],
  ] satisfies [
    string,
    StripeSetupIntent,
    { setupIntentStatus: string; paymentMethodType: string | undefined },
  ][])(
    'rejects %s, logging what Stripe returned',
    async (_case, setupIntent, returned) => {
      const logger = new FakeLogger();
      const stripe = createStripe(
        setupCompletionEvent(createCompletedSetupSession()),
      );
      stripe.seedSetupIntent(setupIntent);

      await expect(
        processEvent(stripe, { consentStateSecret, logger }),
      ).rejects.toMatchObject({
        code: 'INVALID_WEBHOOK_PAYLOAD',
        message: 'Stripe trial setup did not save a card',
      });
      expect(logger.errorCalls).toEqual([
        {
          msg: 'Stripe trial setup did not save a card',
          context: { eventId: 'evt_setup', ...returned },
        },
      ]);
    },
  );
});
