import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CheckoutSessionCreateParams } from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import {
  createStripeCheckoutSession,
  createStripeTrialPaymentMethodSetupSession,
  TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT,
} from './stripe-checkout-sessions';
import { isValidStripeConsentStateSignature } from './stripe-consent-state';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

function sessionUrl(id: string): string {
  return `https://checkout.stripe.test/${id}`;
}

describe('createStripeCheckoutSession trial params', () => {
  const appUserId = crypto.randomUUID();
  const input = {
    userId: appUserId,
    externalCustomerId: 'cus_123',
    ...createTestRenewalTerms('monthly'),
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
  };
  const trialInput = {
    ...input,
    ...createTestRenewalTerms('monthly', true),
    trialPeriodDays: 7,
  };
  const priceIds = { monthly: 'price_m', annual: 'price_a' } as const;
  const logger = new FakeLogger();
  // The fake and the adapter share one frozen clock so seeded Sessions stay
  // open (the fake expires them 24h after creation).
  const fixedNowMs = 1_700_000_000_000;
  const nowMs = () => fixedNowMs;

  function createCheckout(
    stripe: FakeStripeCheckoutClient,
    checkoutInput: typeof input | typeof trialInput,
  ): Promise<{ url: string }> {
    return createStripeCheckoutSession({
      stripe,
      input: checkoutInput,
      priceIds,
      logger,
      nowMs,
    });
  }

  // Seeds an open Session for the customer through the fake's own `create`,
  // so the preflight listing, live retrieval and expiry all see real state.
  async function seedOpenSession(
    stripe: FakeStripeCheckoutClient,
    session: {
      priceId?: string | null;
      metadata?: Record<string, string>;
      paymentMethodCollection?: 'always' | 'if_required';
    } = {},
  ): Promise<string> {
    const { priceId = 'price_m', metadata, paymentMethodCollection } = session;
    const params: CheckoutSessionCreateParams = {
      mode: 'subscription',
      customer: 'cus_123',
      line_items: priceId === null ? [] : [{ price: priceId, quantity: 1 }],
      success_url: 'https://app/success',
      cancel_url: 'https://app/cancel',
      ...(metadata ? { metadata } : {}),
      ...(paymentMethodCollection
        ? { payment_method_collection: paymentMethodCollection }
        : {}),
    };
    const created = await stripe.checkout.sessions.create(params, {
      idempotencyKey: `seed_existing:${randomUUID()}`,
    });
    return created.id;
  }

  function expireCall(sessionId: string) {
    return {
      sessionId,
      options: { idempotencyKey: `expire_checkout_session:${sessionId}` },
    };
  }

  it('adds no-card trial params when trialPeriodDays is provided', async () => {
    const stripe = new FakeStripeCheckoutClient(nowMs);

    await expect(createCheckout(stripe, trialInput)).resolves.toEqual({
      url: sessionUrl('cs_fake_1'),
    });

    expect(stripe.createCalls).toEqual([
      {
        params: {
          mode: 'subscription',
          customer: 'cus_123',
          line_items: [{ price: 'price_m', quantity: 1 }],
          allow_promotion_codes: false,
          billing_address_collection: 'auto',
          consent_collection: { terms_of_service: 'required' },
          success_url: 'https://app/success',
          cancel_url: 'https://app/cancel',
          client_reference_id: appUserId,
          metadata: {
            checkout_variant: 'trial:7',
            renewal_user_id: appUserId,
            renewal_plan: 'monthly',
            renewal_amount_cents: '2900',
            renewal_currency: 'usd',
            renewal_frequency: 'month',
            renewal_disclosure_snapshot: 'Test trial renewal disclosure.',
            renewal_disclosure_version: '2026-08-05',
            renewal_terms_version: '2026-08-05',
            renewal_terms_hash: 'test-terms-hash',
            renewal_cancellation_method:
              'Billing page in the app or support@addictionboards.com',
          },
          payment_method_collection: 'if_required',
          subscription_data: {
            metadata: {
              user_id: appUserId,
            },
            trial_period_days: 7,
            trial_settings: {
              end_behavior: {
                missing_payment_method: 'cancel',
              },
            },
          },
        },
        options: {
          idempotencyKey: `checkout_session:${appUserId}:monthly:trial:7`,
        },
      },
    ]);
  });

  it('omits all trial params when trialPeriodDays is absent', async () => {
    const stripe = new FakeStripeCheckoutClient(nowMs);

    await expect(createCheckout(stripe, input)).resolves.toEqual({
      url: sessionUrl('cs_fake_1'),
    });

    expect(stripe.createCalls).toEqual([
      {
        params: {
          mode: 'subscription',
          customer: 'cus_123',
          line_items: [{ price: 'price_m', quantity: 1 }],
          allow_promotion_codes: false,
          billing_address_collection: 'auto',
          consent_collection: { terms_of_service: 'required' },
          success_url: 'https://app/success',
          cancel_url: 'https://app/cancel',
          client_reference_id: appUserId,
          metadata: {
            checkout_variant: 'standard',
            renewal_user_id: appUserId,
            renewal_plan: 'monthly',
            renewal_amount_cents: '2900',
            renewal_currency: 'usd',
            renewal_frequency: 'month',
            renewal_disclosure_snapshot: 'Test immediate renewal disclosure.',
            renewal_disclosure_version: '2026-08-05',
            renewal_terms_version: '2026-08-05',
            renewal_terms_hash: 'test-terms-hash',
            renewal_cancellation_method:
              'Billing page in the app or support@addictionboards.com',
          },
          subscription_data: {
            metadata: {
              user_id: appUserId,
            },
          },
        },
        options: { idempotencyKey: `checkout_session:${appUserId}:monthly` },
      },
    ]);
    const params = stripe.createCalls[0]?.params;
    if (!params || params.mode === 'setup') {
      throw new Error('Expected subscription-mode create params');
    }
    expect(params).not.toHaveProperty('payment_method_collection');
    expect(params.subscription_data).not.toHaveProperty('trial_period_days');
    expect(params.subscription_data).not.toHaveProperty('trial_settings');
  });

  it('expires an existing same-price trial checkout session when standard checkout is requested', async () => {
    const stripe = new FakeStripeCheckoutClient(nowMs);
    const existingId = await seedOpenSession(stripe, {
      metadata: { checkout_variant: 'trial:7' },
    });
    const seededCreates = stripe.createCalls.length;

    await expect(createCheckout(stripe, input)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(stripe.expireCalls).toEqual([expireCall(existingId)]);
    expect(
      stripe.createCalls.slice(seededCreates).map(({ options }) => options),
    ).toEqual([{ idempotencyKey: `checkout_session:${appUserId}:monthly` }]);
  });

  it('expires a legacy no-card checkout session without variant metadata when standard checkout is requested', async () => {
    const stripe = new FakeStripeCheckoutClient(nowMs);
    const existingId = await seedOpenSession(stripe, {
      paymentMethodCollection: 'if_required',
    });
    const seededCreates = stripe.createCalls.length;

    await expect(createCheckout(stripe, input)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(stripe.expireCalls).toEqual([expireCall(existingId)]);
    expect(
      stripe.createCalls.slice(seededCreates).map(({ options }) => options),
    ).toEqual([{ idempotencyKey: `checkout_session:${appUserId}:monthly` }]);
  });

  it('reuses an existing same-price trial checkout session when checkout variant matches', async () => {
    const stripe = new FakeStripeCheckoutClient(nowMs);
    // A previous trial checkout for this user left its open Session behind.
    await createCheckout(stripe, trialInput);
    const seededCreates = stripe.createCalls.length;
    const seededRetrieves = stripe.retrieveRequests.length;

    await expect(createCheckout(stripe, trialInput)).resolves.toEqual({
      url: sessionUrl('cs_fake_1'),
    });

    expect(stripe.retrieveRequests.slice(seededRetrieves)).toEqual([
      { sessionId: 'cs_fake_1', params: { expand: ['line_items'] } },
    ]);
    expect(stripe.expireCalls).toEqual([]);
    expect(stripe.createCalls.slice(seededCreates)).toEqual([]);
  });

  it('expires an open same-price trial Session created before consent evidence metadata existed', async () => {
    const stripe = new FakeStripeCheckoutClient(nowMs);
    const existingId = await seedOpenSession(stripe, {
      metadata: { checkout_variant: 'trial:7' },
    });
    const seededCreates = stripe.createCalls.length;

    await expect(createCheckout(stripe, trialInput)).resolves.toEqual({
      url: sessionUrl('cs_fake_2'),
    });

    expect(stripe.expireCalls).toEqual([expireCall(existingId)]);
    expect(stripe.createCalls.slice(seededCreates)).toHaveLength(1);
  });

  it.each([
    {
      name: 'the existing session cannot be retrieved',
      seed: {},
      retrieveFails: true,
    },
    {
      name: 'the existing session has a different price',
      seed: { priceId: 'price_a' },
      retrieveFails: false,
    },
    {
      name: 'the existing session price cannot be determined',
      seed: { priceId: null },
      retrieveFails: false,
    },
  ])(
    'creates trial checkout with a replacement idempotency key when $name',
    async ({ seed, retrieveFails }) => {
      const stripe = new FakeStripeCheckoutClient(nowMs);
      const existingId = await seedOpenSession(stripe, seed);
      const seededCreates = stripe.createCalls.length;
      if (retrieveFails) {
        stripe.setRetrieveOverride((session) => {
          if (session.id === existingId) throw new Error('retrieve failed');
          return session;
        });
      }

      await expect(createCheckout(stripe, trialInput)).resolves.toEqual({
        url: sessionUrl('cs_fake_2'),
      });

      expect(stripe.expireCalls).toEqual([expireCall(existingId)]);
      expect(stripe.createCalls.slice(seededCreates)).toEqual([
        {
          params: expect.objectContaining({
            payment_method_collection: 'if_required',
            subscription_data: expect.objectContaining({
              trial_period_days: 7,
            }),
          }),
          options: {
            idempotencyKey: `checkout_session_recovery:${appUserId}:monthly:${existingId}:trial:7`,
          },
        },
      ]);
    },
  );
});

describe('createStripeTrialPaymentMethodSetupSession', () => {
  const appUserId = crypto.randomUUID();
  const setupInput = {
    userId: appUserId,
    externalCustomerId: 'cus_123',
    externalSubscriptionId: 'sub_123',
    plan: 'monthly' as const,
    amountCents: 2900,
    currency: 'usd' as const,
    frequency: 'month' as const,
    trialEndsAt: new Date('2026-08-13T12:00:00.000Z'),
    disclosureVersion: '2026-08-05',
    termsVersion: '2026-08-05',
    termsHash: 'terms-sha256',
    disclosureSnapshot: 'Exact renewal disclosure.',
    cancellationMethod:
      'Billing page in the app or support@addictionboards.com',
    successUrl:
      'https://app.example.com/app/billing?trial_payment_method=success&session_id={CHECKOUT_SESSION_ID}',
    cancelUrl:
      'https://app.example.com/app/billing?trial_payment_method=cancel',
  };
  const stateSecret = 'dedicated-consent-state-secret-32-bytes';

  function createSetupSession(
    stripe: FakeStripeCheckoutClient,
    overrides: Partial<typeof setupInput> = {},
    secret = stateSecret,
  ) {
    return createStripeTrialPaymentMethodSetupSession({
      stripe,
      logger: new FakeLogger(),
      stateSecret: secret,
      input: { ...setupInput, ...overrides },
    });
  }

  it('creates a customer-less setup Checkout Session with signed server-owned consent state', async () => {
    const stripe = new FakeStripeCheckoutClient();

    await expect(
      createSetupSession(stripe, {}, 'whsec_test_state_secret'),
    ).resolves.toEqual({
      sessionId: 'cs_fake_1',
      url: sessionUrl('cs_fake_1'),
    });

    expect(stripe.createCalls).toHaveLength(1);
    const { params, options } = stripe.createCalls[0] ?? {};
    expect(params).toMatchObject({
      mode: 'setup',
      currency: 'usd',
      consent_collection: { terms_of_service: 'required' },
      success_url:
        'https://app.example.com/app/billing?trial_payment_method=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:
        'https://app.example.com/app/billing?trial_payment_method=cancel',
      client_reference_id: appUserId,
      metadata: {
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
        consent_terms_hash: 'terms-sha256',
        consent_state_signature: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(params).not.toHaveProperty('customer');
    expect(params).not.toHaveProperty('line_items');
    expect(params).not.toHaveProperty('payment_method_types');
    if (!params) throw new Error('Expected Checkout Session params');
    const metadata = params.metadata;
    if (!metadata) throw new Error('Expected signed consent metadata');
    const { consent_state_signature: signature, ...signedMetadata } = metadata;
    expect(signature).toBeTypeOf('string');
    expect(
      isValidStripeConsentStateSignature(
        signedMetadata,
        signature ?? '',
        'whsec_test_state_secret',
      ),
    ).toBe(true);
    expect(options).toEqual({
      idempotencyKey: `trial_setup_session:${appUserId}:sub_123:2026-08-05`,
    });
  });

  it('recovers a changed setup request from Stripe idempotency mismatch', async () => {
    const stripe = new FakeStripeCheckoutClient();
    // The deterministic key ignores the terms hash, so a rotated hash reuses
    // it with different parameters and the fake raises the contracted
    // mismatch error.
    await createSetupSession(stripe);
    const seededCreates = stripe.createCalls.length;

    await expect(
      createSetupSession(stripe, { termsHash: 'rotated-terms-hash' }),
    ).resolves.toEqual({
      sessionId: 'cs_fake_2',
      url: sessionUrl('cs_fake_2'),
    });

    const creates = stripe.createCalls.slice(seededCreates);
    expect(creates).toHaveLength(2);
    expect(creates[1]?.options?.idempotencyKey).toMatch(
      /^trial_setup_session_recovery:.*:request:[a-f0-9]{16}$/,
    );
  });

  it('surfaces a second idempotency mismatch from the request-specific recovery key', async () => {
    const stripe = new FakeStripeCheckoutClient();
    const mismatch = Object.assign(new Error('same parameters required'), {
      type: 'StripeIdempotencyError',
      rawType: 'idempotency_error',
      statusCode: 400,
    });
    stripe.setCreateFault(() => {
      throw mismatch;
    });

    await expect(createSetupSession(stripe)).rejects.toBe(mismatch);

    expect(stripe.createCalls).toHaveLength(2);
    expect(stripe.createCalls[1]?.options?.idempotencyKey).toMatch(
      /^trial_setup_session_recovery:.*:request:[a-f0-9]{16}$/,
    );
  });

  it('creates a fresh setup Session when the idempotent replay is already complete', async () => {
    const stripe = new FakeStripeCheckoutClient();
    await createSetupSession(stripe);
    stripe.markComplete('cs_fake_1');
    const seededCreates = stripe.createCalls.length;

    await expect(createSetupSession(stripe)).resolves.toEqual({
      sessionId: 'cs_fake_2',
      url: sessionUrl('cs_fake_2'),
    });

    const creates = stripe.createCalls.slice(seededCreates);
    expect(creates).toHaveLength(2);
    expect(creates[1]?.options?.idempotencyKey).toMatch(
      /^trial_setup_session_recovery:.*:cs_fake_1:attempt:1:[a-f0-9]{16}$/,
    );
  });

  it('fails after the bounded recovery chain keeps returning inactive Sessions', async () => {
    const stripe = new FakeStripeCheckoutClient();
    stripe.setRetrieveOverride((session) => ({
      ...session,
      status: 'complete',
    }));

    await expect(createSetupSession(stripe)).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe Checkout Session is expired or inactive',
    });

    expect(stripe.createCalls).toHaveLength(
      TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT + 1,
    );
    const idempotencyKeys = stripe.createCalls.map(
      ({ options }) => options?.idempotencyKey,
    );
    expect(new Set(idempotencyKeys).size).toBe(
      TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT + 1,
    );
    expect(idempotencyKeys.slice(1)).toEqual(
      Array.from(
        { length: TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT },
        (_, index) =>
          expect.stringMatching(
            new RegExp(
              `:cs_fake_${index + 1}:attempt:${index + 1}:[a-f0-9]{16}$`,
            ),
          ),
      ),
    );
  });
});
