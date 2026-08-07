import { describe, expect, it, vi } from 'vitest';
import type {
  CheckoutSessionCreateParams,
  StripeClient,
  StripeRequestOptions,
} from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import {
  createStripeCheckoutSession,
  createStripeTrialPaymentMethodSetupSession,
} from './stripe-checkout-sessions';
import { isValidStripeConsentStateSignature } from './stripe-consent-state';

function createStripeMock(overrides?: {
  openSessionsData?: Array<{ id: string; url: string | null }>;
  retrievedSessionPriceId?: string | null;
  retrievedSessionMetadata?: Record<string, string>;
  retrievedSessionPaymentMethodCollection?: 'always' | 'if_required';
  shouldThrowOnRetrieve?: boolean;
  setupCreateResults?: Array<
    | Error
    | {
        id: string;
        url: string | null;
        status?: 'open' | 'complete' | 'expired';
      }
  >;
}) {
  const setupCreateResults = [...(overrides?.setupCreateResults ?? [])];
  const sessionsCreate = vi.fn(
    async (
      _params: CheckoutSessionCreateParams,
      _options?: StripeRequestOptions,
    ) => {
      const next = setupCreateResults.shift();
      if (next instanceof Error) throw next;
      return (
        next ?? {
          id: 'cs_new',
          url: 'https://stripe/checkout/new',
        }
      );
    },
  );
  const sessionsRetrieve = vi.fn(async () => {
    if (overrides?.shouldThrowOnRetrieve) {
      throw new Error('retrieve failed');
    }

    const lineItemsData =
      overrides?.retrievedSessionPriceId === null
        ? []
        : [
            {
              price: {
                id: overrides?.retrievedSessionPriceId ?? 'price_m',
              },
            },
          ];

    return {
      id: 'cs_existing',
      url: 'https://stripe/checkout/existing',
      status: 'open' as const,
      expires_at: 1_700_000_001,
      metadata: overrides?.retrievedSessionMetadata,
      payment_method_collection:
        overrides?.retrievedSessionPaymentMethodCollection,
      line_items: {
        data: lineItemsData,
      },
    };
  });
  const sessionsExpire = vi.fn(async () => ({ id: 'cs_existing', url: null }));

  const stripe = {
    customers: { create: vi.fn(async () => ({ id: 'cus_1' })) },
    checkout: {
      sessions: {
        list: vi.fn(async () => ({ data: overrides?.openSessionsData ?? [] })),
        retrieve: sessionsRetrieve,
        expire: sessionsExpire,
        create: sessionsCreate,
      },
    },
    subscriptions: {
      list: vi.fn(async () => ({ data: [] })),
      retrieve: vi.fn(async () => ({})),
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: 'https://stripe/portal' })),
      },
    },
    webhooks: { constructEvent: vi.fn() },
  } as unknown as StripeClient;

  return { stripe, sessionsCreate, sessionsExpire, sessionsRetrieve };
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

  it('adds no-card trial params when trialPeriodDays is provided', async () => {
    const { stripe, sessionsCreate } = createStripeMock();

    await expect(
      createStripeCheckoutSession({
        stripe,
        input: trialInput,
        priceIds,
        logger,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsCreate).toHaveBeenCalledWith(
      {
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
      expect.objectContaining({
        idempotencyKey: `checkout_session:${appUserId}:monthly:trial:7`,
      }),
    );
  });

  it('omits all trial params when trialPeriodDays is absent', async () => {
    const { stripe, sessionsCreate } = createStripeMock();

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsCreate).toHaveBeenCalledWith(
      {
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
      expect.objectContaining({
        idempotencyKey: `checkout_session:${appUserId}:monthly`,
      }),
    );

    const createCalls = sessionsCreate.mock.calls as unknown as Array<
      [Record<string, unknown>, unknown]
    >;
    const params = createCalls[0]?.[0];
    const subscriptionData = params?.subscription_data as
      | Record<string, unknown>
      | undefined;
    expect(params).not.toHaveProperty('payment_method_collection');
    expect(subscriptionData).not.toHaveProperty('trial_period_days');
    expect(subscriptionData).not.toHaveProperty('trial_settings');
  });

  it('expires an existing same-price trial checkout session when standard checkout is requested', async () => {
    const { stripe, sessionsCreate, sessionsExpire } = createStripeMock({
      openSessionsData: [
        { id: 'cs_existing', url: 'https://stripe/checkout/trial' },
      ],
      retrievedSessionMetadata: { checkout_variant: 'trial:7' },
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
        nowMs: () => 1_700_000_000_000,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsExpire).toHaveBeenCalledWith('cs_existing', undefined, {
      idempotencyKey: 'expire_checkout_session:cs_existing',
    });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: `checkout_session:${appUserId}:monthly`,
      }),
    );
  });

  it('expires a legacy no-card checkout session without variant metadata when standard checkout is requested', async () => {
    const { stripe, sessionsCreate, sessionsExpire } = createStripeMock({
      openSessionsData: [
        { id: 'cs_existing', url: 'https://stripe/checkout/legacy-trial' },
      ],
      retrievedSessionPaymentMethodCollection: 'if_required',
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input,
        priceIds,
        logger,
        nowMs: () => 1_700_000_000_000,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsExpire).toHaveBeenCalledWith('cs_existing', undefined, {
      idempotencyKey: 'expire_checkout_session:cs_existing',
    });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: `checkout_session:${appUserId}:monthly`,
      }),
    );
  });

  it('reuses an existing same-price trial checkout session when checkout variant matches', async () => {
    const { stripe, sessionsCreate, sessionsExpire, sessionsRetrieve } =
      createStripeMock({
        openSessionsData: [
          { id: 'cs_existing', url: 'https://stripe/checkout/trial' },
        ],
        retrievedSessionMetadata: {
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
      });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input: trialInput,
        priceIds,
        logger,
        nowMs: () => 1_700_000_000_000,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/trial' });

    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_existing', {
      expand: ['line_items'],
    });
    expect(sessionsExpire).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('expires an open same-price trial Session created before consent evidence metadata existed', async () => {
    const { stripe, sessionsCreate, sessionsExpire } = createStripeMock({
      openSessionsData: [
        { id: 'cs_existing', url: 'https://stripe/checkout/pre-consent' },
      ],
      retrievedSessionMetadata: { checkout_variant: 'trial:7' },
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input: trialInput,
        priceIds,
        logger,
        nowMs: () => 1_700_000_000_000,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsExpire).toHaveBeenCalledWith('cs_existing', undefined, {
      idempotencyKey: 'expire_checkout_session:cs_existing',
    });
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: 'the existing session cannot be retrieved',
      overrides: { shouldThrowOnRetrieve: true },
    },
    {
      name: 'the existing session has a different price',
      overrides: { retrievedSessionPriceId: 'price_a' },
    },
    {
      name: 'the existing session price cannot be determined',
      overrides: { retrievedSessionPriceId: null },
    },
  ])('creates trial checkout with a replacement idempotency key when $name', async ({
    overrides,
  }) => {
    const { stripe, sessionsCreate, sessionsExpire } = createStripeMock({
      openSessionsData: [
        { id: 'cs_existing', url: 'https://stripe/checkout/existing' },
      ],
      ...overrides,
    });

    await expect(
      createStripeCheckoutSession({
        stripe,
        input: trialInput,
        priceIds,
        logger,
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout/new' });

    expect(sessionsExpire).toHaveBeenCalledWith('cs_existing', undefined, {
      idempotencyKey: 'expire_checkout_session:cs_existing',
    });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_collection: 'if_required',
        subscription_data: expect.objectContaining({
          trial_period_days: 7,
        }),
      }),
      expect.objectContaining({
        idempotencyKey: `checkout_session_recovery:${appUserId}:monthly:cs_existing:trial:7`,
      }),
    );
  });
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

  it('creates a customer-less setup Checkout Session with signed server-owned consent state', async () => {
    const { stripe, sessionsCreate } = createStripeMock();

    await expect(
      createStripeTrialPaymentMethodSetupSession({
        stripe,
        logger: new FakeLogger(),
        stateSecret: 'whsec_test_state_secret',
        input: setupInput,
      }),
    ).resolves.toEqual({
      sessionId: 'cs_new',
      url: 'https://stripe/checkout/new',
    });

    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    const [params, options] = sessionsCreate.mock.calls[0] ?? [];
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
    const mismatch = Object.assign(
      new Error(
        'Keys for idempotent requests can only be used with the same parameters they were first used with.',
      ),
      {
        type: 'StripeIdempotencyError',
        rawType: 'idempotency_error',
        statusCode: 400,
      },
    );
    const { stripe, sessionsCreate } = createStripeMock({
      setupCreateResults: [
        mismatch,
        { id: 'cs_recovered', url: 'https://stripe/checkout/recovered' },
      ],
    });

    await expect(
      createStripeTrialPaymentMethodSetupSession({
        stripe,
        logger: new FakeLogger(),
        stateSecret: 'dedicated-consent-state-secret-32-bytes',
        input: { ...setupInput, termsHash: 'rotated-terms-hash' },
      }),
    ).resolves.toEqual({
      sessionId: 'cs_recovered',
      url: 'https://stripe/checkout/recovered',
    });

    expect(sessionsCreate).toHaveBeenCalledTimes(2);
    expect(sessionsCreate.mock.calls[1]?.[1]?.idempotencyKey).toMatch(
      /^trial_setup_session_recovery:.*:request:[a-f0-9]{16}$/,
    );
  });

  it('surfaces a second idempotency mismatch from the request-specific recovery key', async () => {
    const mismatch = Object.assign(new Error('same parameters required'), {
      type: 'StripeIdempotencyError',
      rawType: 'idempotency_error',
      statusCode: 400,
    });
    const { stripe, sessionsCreate } = createStripeMock({
      setupCreateResults: [mismatch, mismatch],
    });

    await expect(
      createStripeTrialPaymentMethodSetupSession({
        stripe,
        logger: new FakeLogger(),
        stateSecret: 'dedicated-consent-state-secret-32-bytes',
        input: setupInput,
      }),
    ).rejects.toBe(mismatch);

    expect(sessionsCreate).toHaveBeenCalledTimes(2);
    expect(sessionsCreate.mock.calls[1]?.[1]?.idempotencyKey).toMatch(
      /^trial_setup_session_recovery:.*:request:[a-f0-9]{16}$/,
    );
  });

  it('creates a fresh setup Session when the idempotent replay is already complete', async () => {
    const { stripe, sessionsCreate } = createStripeMock({
      setupCreateResults: [
        { id: 'cs_complete', url: null, status: 'complete' },
        {
          id: 'cs_fresh',
          url: 'https://stripe/checkout/fresh',
          status: 'open',
        },
      ],
    });

    await expect(
      createStripeTrialPaymentMethodSetupSession({
        stripe,
        logger: new FakeLogger(),
        stateSecret: 'dedicated-consent-state-secret-32-bytes',
        input: setupInput,
      }),
    ).resolves.toEqual({
      sessionId: 'cs_fresh',
      url: 'https://stripe/checkout/fresh',
    });

    expect(sessionsCreate).toHaveBeenCalledTimes(2);
    expect(sessionsCreate.mock.calls[1]?.[1]?.idempotencyKey).toMatch(
      /^trial_setup_session_recovery:.*:cs_complete:[a-f0-9]{16}$/,
    );
  });

  it('fails after the bounded recovery chain keeps returning inactive Sessions', async () => {
    const setupCreateResults = Array.from({ length: 21 }, (_, index) => ({
      id: `cs_complete_${index}`,
      url: null,
      status: 'complete' as const,
    }));
    const { stripe, sessionsCreate } = createStripeMock({ setupCreateResults });

    await expect(
      createStripeTrialPaymentMethodSetupSession({
        stripe,
        logger: new FakeLogger(),
        stateSecret: 'dedicated-consent-state-secret-32-bytes',
        input: setupInput,
      }),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe Checkout Session is expired or inactive',
    });

    expect(sessionsCreate).toHaveBeenCalledTimes(21);
  });
});
