import { describe, expect, it, vi } from 'vitest';
import { STRIPE_SUBSCRIPTION_METADATA_E2E_OWNER_FIELD } from '@/src/adapters/shared/stripe-subscription-errors';
import type { StripeClient } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import { loadJsonFixture } from '@/tests/shared/load-json-fixture';
import {
  createStripeConsentStateSignature,
  isValidStripeConsentStateSignature,
} from './stripe/stripe-consent-state';
import {
  FakeStripeCheckoutClient,
  type SeededSubscription,
} from './stripe/test-helpers/fake-stripe-checkout-client';
import { StripePaymentGateway } from './stripe-payment-gateway';

const TEST_WEBHOOK_SECRET = 'whsec_1';
const TEST_PRICE_IDS = { monthly: 'price_m', annual: 'price_a' } as const;
const appUserId = crypto.randomUUID();

type StripeWebhookEventFixture<TObject> = {
  id: string;
  type: string;
  data: { object: TObject };
  [key: string]: unknown;
};

type StripeSubscriptionFixtureObject = {
  metadata?: Record<string, string>;
  [key: string]: unknown;
};

function withSubscriptionUserId<T extends StripeSubscriptionFixtureObject>(
  subscription: T,
  userId = appUserId,
): T {
  return {
    ...subscription,
    metadata: {
      ...(subscription.metadata ?? {}),
      user_id: userId,
    },
  };
}

function createGateway(
  stripe: StripeClient,
  options?: {
    logger?: FakeLogger;
    consentStateSecret?: string;
    webhookE2EOwner?: string;
  },
) {
  return new StripePaymentGateway({
    stripe,
    webhookSecret: TEST_WEBHOOK_SECRET,
    consentStateSecret:
      options?.consentStateSecret ?? 'consent-state-secret-at-least-32-bytes',
    priceIds: TEST_PRICE_IDS,
    logger: options?.logger ?? new FakeLogger(),
    ...(options?.webhookE2EOwner
      ? { webhookE2EOwner: options.webhookE2EOwner }
      : {}),
  });
}

// The live Subscription the fake serves: the monthly TEST price, owned by the
// test user unless the metadata says otherwise.
function liveSubscription(
  metadata: Record<string, string> = { user_id: appUserId },
): SeededSubscription {
  return {
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    metadata,
    items: {
      data: [
        {
          current_period_end: 1_700_000_000,
          price: { id: TEST_PRICE_IDS.monthly },
        },
      ],
    },
  };
}

// A fake holding one PaymentMethod, attached to the given customer or none.
function fakeWithPaymentMethod(
  customer: string | null,
): FakeStripeCheckoutClient {
  const stripe = new FakeStripeCheckoutClient();
  stripe.seedPaymentMethod({ id: 'pm_123', customer });
  return stripe;
}

describe('StripePaymentGateway', () => {
  it('keeps trial consent Session creation fail-closed until the dedicated secret is configured', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const gateway = new StripePaymentGateway({
      stripe,
      webhookSecret: TEST_WEBHOOK_SECRET,
      priceIds: TEST_PRICE_IDS,
      logger: new FakeLogger(),
    });

    await expect(
      gateway.createTrialPaymentMethodSetupSession({
        userId: appUserId,
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        ...createTestRenewalTerms('monthly', true),
        trialEndsAt: new Date('2026-08-13T12:00:00Z'),
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(stripe.createCalls).toEqual([]);
  });

  // PaymentMethod attach/detach and the Subscription default are the fake's,
  // contracted against Stripe TEST mode; these cases pin the facade's own
  // reconcile, ownership and idempotency-key rules.
  it('attaches a trial payment method and selects it with Session-derived idempotency keys', async () => {
    const stripe = fakeWithPaymentMethod(null);
    stripe.seedSubscription(liveSubscription());
    const gateway = createGateway(stripe);

    await gateway.attachTrialPaymentMethod({
      sessionId: 'cs_setup_123',
      externalPaymentMethodId: 'pm_123',
      externalCustomerId: 'cus_123',
    });
    await gateway.setTrialSubscriptionDefaultPaymentMethod({
      sessionId: 'cs_setup_123',
      externalPaymentMethodId: 'pm_123',
      externalSubscriptionId: 'sub_123',
    });

    expect(stripe.paymentMethods.retrieveCalls).toEqual(['pm_123']);
    expect(stripe.paymentMethods.attachCalls).toEqual([
      {
        paymentMethodId: 'pm_123',
        customer: 'cus_123',
        options: {
          idempotencyKey: 'trial_setup:cs_setup_123:attach_payment_method',
        },
      },
    ]);
    expect(stripe.subscriptions.updateCalls).toEqual([
      {
        subscriptionId: 'sub_123',
        params: { default_payment_method: 'pm_123' },
        options: {
          idempotencyKey: 'trial_setup:cs_setup_123:set_subscription_default',
        },
      },
    ]);
  });

  it('reconciles an already-attached payment method without issuing a second attach', async () => {
    const stripe = fakeWithPaymentMethod('cus_123');

    await createGateway(stripe).attachTrialPaymentMethod({
      sessionId: 'cs_setup_123',
      externalPaymentMethodId: 'pm_123',
      externalCustomerId: 'cus_123',
    });

    expect(stripe.paymentMethods.retrieveCalls).toEqual(['pm_123']);
    expect(stripe.paymentMethods.attachCalls).toEqual([]);
  });

  it('detaches a setup payment method with a Session-derived idempotency key', async () => {
    const stripe = fakeWithPaymentMethod('cus_unverified');

    await createGateway(stripe).detachTrialPaymentMethod({
      sessionId: 'cs_setup_123',
      externalPaymentMethodId: 'pm_123',
      externalCustomerId: 'cus_unverified',
    });

    expect(stripe.paymentMethods.detachCalls).toEqual([
      {
        paymentMethodId: 'pm_123',
        options: {
          idempotencyKey: 'trial_setup:cs_setup_123:detach_payment_method',
        },
      },
    ]);
  });

  it('does not detach a setup payment method owned by a different customer', async () => {
    const stripe = fakeWithPaymentMethod('cus_other');

    await createGateway(stripe).detachTrialPaymentMethod({
      sessionId: 'cs_setup_123',
      externalPaymentMethodId: 'pm_123',
      externalCustomerId: 'cus_expected',
    });

    expect(stripe.paymentMethods.detachCalls).toEqual([]);
  });

  it('rejects an attachment response that is not bound to the verified customer', async () => {
    const stripe = fakeWithPaymentMethod(null);
    // Stripe binds an attach to the requested customer; this is a response it
    // could not send.
    stripe.setPaymentMethodAttachOverride((paymentMethod) => ({
      ...paymentMethod,
      customer: 'cus_other',
    }));

    await expect(
      createGateway(stripe).attachTrialPaymentMethod({
        sessionId: 'cs_setup_123',
        externalPaymentMethodId: 'pm_123',
        externalCustomerId: 'cus_123',
      }),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
  });

  it('rejects a payment method already attached to another customer', async () => {
    const stripe = fakeWithPaymentMethod('cus_other');

    await expect(
      createGateway(stripe).attachTrialPaymentMethod({
        sessionId: 'cs_setup_123',
        externalPaymentMethodId: 'pm_123',
        externalCustomerId: 'cus_123',
      }),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
    expect(stripe.paymentMethods.attachCalls).toEqual([]);
  });

  // Customer, Checkout and portal behavior is pinned at the adapter level, on
  // the fake, in stripe/stripe-customers.test.ts, the stripe-checkout-sessions
  // suites and stripe/stripe-portal.test.ts. These cases pin only what the
  // facade decides: which caller options reach each adapter, the price ids,
  // and which secret signs setup-Session state.
  it("creates a Stripe customer with the caller's idempotency key", async () => {
    const stripe = new FakeStripeCheckoutClient();
    const create = vi
      .spyOn(stripe.customers, 'create')
      .mockResolvedValue({ id: 'cus_123' });

    await expect(
      createGateway(stripe).createCustomer(
        {
          userId: appUserId,
          clerkUserId: 'clerk_1',
          email: 'user@example.com',
        },
        { idempotencyKey: 'caller_customer_key' },
      ),
    ).resolves.toEqual({ externalCustomerId: 'cus_123' });

    expect(stripe.customers.searchCalls).toEqual([
      { query: `metadata['user_id']:'${appUserId}'`, limit: 2 },
    ]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' }),
      { idempotencyKey: 'caller_customer_key' },
    );
  });

  it('uses a deterministic checkout idempotency key regardless of provided options', async () => {
    const stripe = new FakeStripeCheckoutClient();

    await expect(
      createGateway(stripe).createCheckoutSession(
        {
          userId: appUserId,
          externalCustomerId: 'cus_123',
          ...createTestRenewalTerms('monthly'),
          successUrl: 'https://app/success',
          cancelUrl: 'https://app/cancel',
        },
        { idempotencyKey: 'checkout_idem_custom_1' },
      ),
    ).resolves.toEqual({ url: 'https://checkout.stripe.test/cs_fake_1' });

    expect(stripe.createCalls).toEqual([
      {
        params: expect.objectContaining({
          mode: 'subscription',
          customer: 'cus_123',
          line_items: [{ price: TEST_PRICE_IDS.monthly, quantity: 1 }],
          allow_promotion_codes: false,
          billing_address_collection: 'auto',
          success_url: 'https://app/success',
          cancel_url: 'https://app/cancel',
          client_reference_id: appUserId,
          subscription_data: {
            metadata: { user_id: appUserId },
          },
        }),
        options: expect.objectContaining({
          idempotencyKey: `checkout_session:${appUserId}:monthly`,
        }),
      },
    ]);
  });

  it('creates the trial payment-method setup Session through the customer-less setup seam', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const consentStateSecret = 'dedicated-consent-state-secret-32-bytes';
    const gateway = createGateway(stripe, { consentStateSecret });

    await expect(
      gateway.createTrialPaymentMethodSetupSession({
        userId: appUserId,
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        amountCents: 2900,
        currency: 'usd',
        frequency: 'month',
        trialEndsAt: new Date('2026-08-13T12:00:00Z'),
        disclosureVersion: '2026-08-05',
        termsVersion: '2026-08-05',
        termsHash: 'terms-hash',
        disclosureSnapshot: 'Exact disclosure.',
        cancellationMethod:
          'Billing page in the app or support@addictionboards.com',
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).resolves.toEqual({
      sessionId: 'cs_fake_1',
      url: 'https://checkout.stripe.test/cs_fake_1',
    });

    const params = stripe.createCalls[0]?.params;
    expect(params).toEqual(
      expect.objectContaining({
        mode: 'setup',
        currency: 'usd',
        consent_collection: { terms_of_service: 'required' },
      }),
    );
    expect(params).not.toHaveProperty('customer');
    expect(stripe.retrieveCalls).toContain('cs_fake_1');
    const metadata = params?.metadata;
    if (!metadata) throw new Error('Expected signed setup metadata');
    const { consent_state_signature: signature, ...signedMetadata } = metadata;
    expect(
      isValidStripeConsentStateSignature(
        signedMetadata,
        signature ?? '',
        consentStateSecret,
      ),
    ).toBe(true);
    expect(
      isValidStripeConsentStateSignature(
        signedMetadata,
        signature ?? '',
        TEST_WEBHOOK_SECRET,
      ),
    ).toBe(false);
  });

  it("creates a billing portal session with the caller's idempotency key", async () => {
    const stripe = new FakeStripeCheckoutClient();
    const create = vi.spyOn(stripe.billingPortal.sessions, 'create');

    await expect(
      createGateway(stripe).createPortalSession(
        { externalCustomerId: 'cus_123', returnUrl: 'https://app/return' },
        { idempotencyKey: 'caller_portal_key' },
      ),
    ).resolves.toEqual({ url: 'https://billing.stripe.test/session' });

    expect(create).toHaveBeenCalledWith(
      { customer: 'cus_123', return_url: 'https://app/return' },
      { idempotencyKey: 'caller_portal_key' },
    );
  });

  // Webhook normalization is pinned at the adapter level, on the fake, in
  // stripe/stripe-webhook-processor.test.ts. These cases pin only what the
  // facade forwards to it: the webhook secret, price ids, logger, consent-state
  // secret and E2E owner.
  it('verifies webhook signatures with the configured secret and normalizes subscription events', async () => {
    const event = loadJsonFixture<
      StripeWebhookEventFixture<{ id: string; [key: string]: unknown }>
    >('stripe/customer.subscription.updated.json');
    const stripe = new FakeStripeCheckoutClient();
    stripe.setWebhookEvent({
      ...event,
      data: { object: withSubscriptionUserId(event.data.object) },
    });
    stripe.seedSubscription(liveSubscription());

    await expect(
      createGateway(stripe).processWebhookEvent('raw_body', 'sig_1'),
    ).resolves.toEqual({
      eventId: 'evt_1',
      occurredAt: new Date(1_700_000_000 * 1000),
      type: 'customer.subscription.updated',
      subscriptionUpdate: {
        userId: appUserId,
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date(1_700_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });
    expect(stripe.webhookCalls).toEqual([
      { rawBody: 'raw_body', signature: 'sig_1', secret: 'whsec_1' },
    ]);
    expect(stripe.subscriptions.retrieveCalls).toEqual(['sub_123']);
  });

  it('calls logger.error when webhook verification fails', async () => {
    // No event is injected, so the fake's verification throws.
    const stripe = new FakeStripeCheckoutClient();
    const logger = new FakeLogger();

    await expect(
      createGateway(stripe, { logger }).processWebhookEvent(
        'raw_body',
        'sig_1',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_SIGNATURE' });

    expect(logger.errorCalls).toContainEqual({
      context: { error: 'FakeStripeCheckoutClient does not process webhooks' },
      msg: 'Webhook signature verification failed',
    });
  });

  it('forwards the consent-state secret to webhook processing', async () => {
    const consentStateSecret = 'consent-state-secret-at-least-32-bytes';
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
    const stripe = new FakeStripeCheckoutClient();
    stripe.setWebhookEvent({
      id: 'evt_setup_expired',
      type: 'checkout.session.expired',
      created: 1_775_649_600,
      data: {
        object: {
          id: 'cs_setup_123',
          mode: 'setup',
          metadata: {
            ...metadata,
            consent_state_signature: createStripeConsentStateSignature(
              metadata,
              consentStateSecret,
            ),
          },
        },
      },
    });

    await expect(
      createGateway(stripe, { consentStateSecret }).processWebhookEvent(
        'raw_body',
        'sig_1',
      ),
    ).resolves.toMatchObject({
      eventId: 'evt_setup_expired',
      trialPaymentMethodSetupExpiration: {
        sessionId: 'cs_setup_123',
        userId: appUserId,
      },
    });
  });

  it('forwards the E2E owner to webhook processing', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.setWebhookEvent({
      id: 'evt_foreign_owner',
      type: 'customer.subscription.updated',
      data: { object: liveSubscription() },
    });
    stripe.seedSubscription(
      liveSubscription({ user_id: appUserId, e2e_owner: 'github-ci' }),
    );

    await expect(
      createGateway(stripe, {
        webhookE2EOwner: 'vercel-dev-preview',
      }).processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      fieldErrors: {
        [STRIPE_SUBSCRIPTION_METADATA_E2E_OWNER_FIELD]: ['mismatch'],
      },
    });
  });
});
