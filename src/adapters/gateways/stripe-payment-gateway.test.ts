// biome-ignore lint/style/noExcessiveLinesPerFile: Keep subscription, Checkout, portal, and retry adapter contracts together — split tracked by DEBT-469.
import { describe, expect, it, vi } from 'vitest';
import type {
  CheckoutSessionCreateParams,
  StripeBillingPortalSession,
  StripeCheckoutSession,
  StripeCheckoutSessionList,
  StripeCheckoutSessionRetrieved,
  StripeClient,
  StripeCustomer,
  StripeCustomerSearchResult,
  StripeRequestOptions,
  StripeSubscription,
  StripeSubscriptionListResult,
} from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  createTestCheckoutRenewalMetadata,
  createTestRenewalTerms,
} from '@/src/application/test-helpers/renewal-terms';
import { loadJsonFixture } from '@/tests/shared/load-json-fixture';
import { SUBSCRIPTION_LIST_LIMIT } from './stripe/stripe-checkout-sessions';
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

function createStripeMockBase() {
  const customersCreate = vi.fn(
    async () => ({ id: 'cus_123' }) as StripeCustomer,
  );
  const customersSearch = vi.fn(
    async () => ({ data: [] }) as StripeCustomerSearchResult,
  );
  const sessionsCreate = vi.fn(
    async (
      _params: CheckoutSessionCreateParams,
      _options?: StripeRequestOptions,
    ) =>
      ({
        id: 'cs_new',
        url: 'https://stripe/checkout',
      }) as StripeCheckoutSession,
  );
  const sessionsList = vi.fn(
    async () => ({ data: [] }) as StripeCheckoutSessionList,
  );
  const sessionsRetrieve = vi.fn(
    async () =>
      ({
        id: 'cs_existing',
        url: 'https://stripe/existing-checkout',
        line_items: { data: [] },
      }) as StripeCheckoutSessionRetrieved,
  );
  const sessionsExpire = vi.fn(
    async () =>
      ({
        id: 'cs_existing',
        url: 'https://stripe/existing-checkout',
      }) as StripeCheckoutSession,
  );
  const portalSessionsCreate = vi.fn(
    async () =>
      ({ url: 'https://stripe/portal' }) as StripeBillingPortalSession,
  );
  const constructEvent = vi.fn<StripeClient['webhooks']['constructEvent']>(
    () => {
      throw new Error('unexpected webhook call');
    },
  );

  const stripe = {
    customers: { create: customersCreate, search: customersSearch },
    checkout: {
      sessions: {
        create: sessionsCreate,
        list: sessionsList,
        retrieve: sessionsRetrieve,
        expire: sessionsExpire,
      },
    },
    billingPortal: { sessions: { create: portalSessionsCreate } },
    webhooks: { constructEvent },
  } satisfies StripeClient;

  return {
    stripe,
    customersCreate,
    customersSearch,
    sessionsCreate,
    sessionsList,
    sessionsRetrieve,
    sessionsExpire,
    portalSessionsCreate,
    constructEvent,
  };
}

function createStripeMockWithSubscriptions() {
  const base = createStripeMockBase();

  const subscriptionsRetrieve = vi.fn(async () => ({}) as StripeSubscription);
  const subscriptionsList = vi.fn(
    async () => ({ data: [] }) as StripeSubscriptionListResult,
  );
  const subscriptionsCancel = vi.fn(async () => ({}) as StripeSubscription);

  const stripe = {
    ...base.stripe,
    subscriptions: {
      retrieve: subscriptionsRetrieve,
      list: subscriptionsList,
      cancel: subscriptionsCancel,
    },
  } satisfies StripeClient;

  return {
    ...base,
    stripe,
    subscriptionsRetrieve,
    subscriptionsList,
    subscriptionsCancel,
  };
}

function createStripeMock(options?: {
  withSubscriptions?: false;
}): ReturnType<typeof createStripeMockBase>;
function createStripeMock(options: {
  withSubscriptions: true;
}): ReturnType<typeof createStripeMockWithSubscriptions>;
function createStripeMock({
  withSubscriptions = false,
}: {
  withSubscriptions?: boolean;
} = {}) {
  return withSubscriptions
    ? createStripeMockWithSubscriptions()
    : createStripeMockBase();
}

describe('StripePaymentGateway', () => {
  it('keeps trial consent Session creation fail-closed until the dedicated secret is configured', async () => {
    const { stripe, sessionsCreate } = createStripeMock({
      withSubscriptions: true,
    });
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
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('attaches a trial payment method and selects it with Session-derived idempotency keys', async () => {
    const base = createStripeMock({ withSubscriptions: true });
    const retrieve = vi.fn(async () => ({ id: 'pm_123', customer: null }));
    const attach = vi.fn(async () => ({
      id: 'pm_123',
      customer: 'cus_123',
    }));
    const update = vi.fn(async () => ({}));
    const stripe: StripeClient = {
      ...base.stripe,
      paymentMethods: { retrieve, attach },
      subscriptions: { ...base.stripe.subscriptions, update },
    };
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

    expect(attach).toHaveBeenCalledWith(
      'pm_123',
      { customer: 'cus_123' },
      { idempotencyKey: 'trial_setup:cs_setup_123:attach_payment_method' },
    );
    expect(retrieve).toHaveBeenCalledWith('pm_123');
    expect(update).toHaveBeenCalledWith(
      'sub_123',
      { default_payment_method: 'pm_123' },
      { idempotencyKey: 'trial_setup:cs_setup_123:set_subscription_default' },
    );
  });

  it('reconciles an already-attached payment method without issuing a second attach', async () => {
    const base = createStripeMock({ withSubscriptions: true });
    const retrieve = vi.fn(async () => ({
      id: 'pm_123',
      customer: 'cus_123',
    }));
    const attach = vi.fn(async () => ({
      id: 'pm_123',
      customer: 'cus_123',
    }));
    const stripe: StripeClient = {
      ...base.stripe,
      paymentMethods: { retrieve, attach },
    };

    await createGateway(stripe).attachTrialPaymentMethod({
      sessionId: 'cs_setup_123',
      externalPaymentMethodId: 'pm_123',
      externalCustomerId: 'cus_123',
    });

    expect(retrieve).toHaveBeenCalledWith('pm_123');
    expect(attach).not.toHaveBeenCalled();
  });

  it('detaches a setup payment method with a Session-derived idempotency key', async () => {
    const base = createStripeMock({ withSubscriptions: true });
    const retrieve = vi.fn(async () => ({
      id: 'pm_123',
      customer: 'cus_unverified',
    }));
    const attach = vi.fn(async () => ({
      id: 'pm_123',
      customer: 'cus_unverified',
    }));
    const detach = vi.fn(async () => ({ id: 'pm_123', customer: null }));
    const stripe: StripeClient = {
      ...base.stripe,
      paymentMethods: { retrieve, attach, detach },
    };

    await createGateway(stripe).detachTrialPaymentMethod({
      sessionId: 'cs_setup_123',
      externalPaymentMethodId: 'pm_123',
      externalCustomerId: 'cus_unverified',
    });

    expect(detach).toHaveBeenCalledWith('pm_123', undefined, {
      idempotencyKey: 'trial_setup:cs_setup_123:detach_payment_method',
    });
  });

  it('does not detach a setup payment method owned by a different customer', async () => {
    const base = createStripeMock({ withSubscriptions: true });
    const retrieve = vi.fn(async () => ({
      id: 'pm_123',
      customer: 'cus_other',
    }));
    const attach = vi.fn(async () => ({
      id: 'pm_123',
      customer: 'cus_other',
    }));
    const detach = vi.fn(async () => ({ id: 'pm_123', customer: null }));
    const stripe: StripeClient = {
      ...base.stripe,
      paymentMethods: { retrieve, attach, detach },
    };

    await createGateway(stripe).detachTrialPaymentMethod({
      sessionId: 'cs_setup_123',
      externalPaymentMethodId: 'pm_123',
      externalCustomerId: 'cus_expected',
    });

    expect(detach).not.toHaveBeenCalled();
  });

  it('rejects an attachment response that is not bound to the verified customer', async () => {
    const base = createStripeMock({ withSubscriptions: true });
    const stripe: StripeClient = {
      ...base.stripe,
      paymentMethods: {
        retrieve: vi.fn(async () => ({ id: 'pm_123', customer: null })),
        attach: vi.fn(async () => ({ id: 'pm_123', customer: 'cus_other' })),
      },
    };

    await expect(
      createGateway(stripe).attachTrialPaymentMethod({
        sessionId: 'cs_setup_123',
        externalPaymentMethodId: 'pm_123',
        externalCustomerId: 'cus_123',
      }),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
  });

  it('rejects a payment method already attached to another customer', async () => {
    const base = createStripeMock({ withSubscriptions: true });
    const attach = vi.fn(async () => ({
      id: 'pm_123',
      customer: 'cus_123',
    }));
    const stripe: StripeClient = {
      ...base.stripe,
      paymentMethods: {
        retrieve: vi.fn(async () => ({
          id: 'pm_123',
          customer: 'cus_other',
        })),
        attach,
      },
    };

    await expect(
      createGateway(stripe).attachTrialPaymentMethod({
        sessionId: 'cs_setup_123',
        externalPaymentMethodId: 'pm_123',
        externalCustomerId: 'cus_123',
      }),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
    expect(attach).not.toHaveBeenCalled();
  });

  it('creates a Stripe customer with the correct Stripe parameters', async () => {
    const { stripe, customersCreate, customersSearch } = createStripeMock();
    const gateway = createGateway(stripe);

    await expect(
      gateway.createCustomer({
        userId: appUserId,
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      }),
    ).resolves.toEqual({ externalCustomerId: 'cus_123' });

    expect(customersCreate).toHaveBeenCalledWith(
      {
        email: 'user@example.com',
        metadata: { user_id: appUserId, clerk_user_id: 'clerk_1' },
      },
      {
        idempotencyKey: `create_stripe_customer:${appUserId}`,
      },
    );
    expect(customersSearch).toHaveBeenCalledWith({
      query: `metadata['user_id']:'${appUserId}'`,
      limit: 2,
    });
  });

  it('reuses an existing Stripe customer when one is found by metadata', async () => {
    const { stripe, customersCreate, customersSearch } = createStripeMock();
    customersCreate.mockResolvedValue({ id: 'cus_new' });
    customersSearch.mockResolvedValue({ data: [{ id: 'cus_123' }] });
    const gateway = createGateway(stripe);

    await expect(
      gateway.createCustomer({
        userId: appUserId,
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      }),
    ).resolves.toEqual({ externalCustomerId: 'cus_123' });

    expect(customersSearch).toHaveBeenCalledWith({
      query: `metadata['user_id']:'${appUserId}'`,
      limit: 2,
    });
    expect(customersCreate).toHaveBeenCalledTimes(0);
  });

  it('retries Stripe customer creation on transient errors when an idempotency key is provided', async () => {
    const { stripe, customersCreate } = createStripeMock();
    customersCreate
      .mockRejectedValueOnce(
        Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
      )
      .mockResolvedValueOnce({ id: 'cus_123' });
    const gateway = createGateway(stripe);

    await expect(
      gateway.createCustomer(
        {
          userId: appUserId,
          clerkUserId: 'clerk_1',
          email: 'user@example.com',
        },
        { idempotencyKey: '11111111-1111-1111-1111-111111111111' },
      ),
    ).resolves.toEqual({ externalCustomerId: 'cus_123' });

    expect(customersCreate).toHaveBeenCalledTimes(2);
  });

  it('throws STRIPE_ERROR when a Stripe customer id is missing', async () => {
    const { stripe, customersCreate } = createStripeMock();
    customersCreate.mockResolvedValue({});
    const gateway = createGateway(stripe);

    await expect(
      gateway.createCustomer({
        userId: appUserId,
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      }),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
  });

  it('uses a deterministic checkout idempotency key regardless of provided options', async () => {
    const { stripe, sessionsCreate } = createStripeMock();
    const gateway = createGateway(stripe);

    await expect(
      gateway.createCheckoutSession(
        {
          userId: appUserId,
          externalCustomerId: 'cus_123',
          ...createTestRenewalTerms('monthly'),
          successUrl: 'https://app/success',
          cancelUrl: 'https://app/cancel',
        },
        { idempotencyKey: 'checkout_idem_custom_1' },
      ),
    ).resolves.toEqual({ url: 'https://stripe/checkout' });

    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_123',
        line_items: [{ price: 'price_m', quantity: 1 }],
        allow_promotion_codes: false,
        billing_address_collection: 'auto',
        success_url: 'https://app/success',
        cancel_url: 'https://app/cancel',
        client_reference_id: appUserId,
        subscription_data: {
          metadata: { user_id: appUserId },
        },
      }),
      expect.objectContaining({
        idempotencyKey: `checkout_session:${appUserId}:monthly`,
      }),
    );
  });

  it('creates the trial payment-method setup Session through the customer-less setup seam', async () => {
    const { stripe, sessionsCreate, sessionsRetrieve } = createStripeMock();
    sessionsRetrieve.mockResolvedValue({
      id: 'cs_new',
      url: 'https://stripe/checkout',
      status: 'open',
    });
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
      sessionId: 'cs_new',
      url: 'https://stripe/checkout',
    });

    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'setup',
        currency: 'usd',
        consent_collection: { terms_of_service: 'required' },
      }),
      expect.any(Object),
    );
    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_new');
    expect(sessionsCreate.mock.calls[0]?.[0]).not.toHaveProperty('customer');
    const metadata = sessionsCreate.mock.calls[0]?.[0].metadata;
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

  it.each([
    'active',
    'trialing',
    'past_due',
    'unpaid',
    'incomplete',
    'paused',
  ] as const)(
    'throws ALREADY_SUBSCRIBED when Stripe has a %s subscription for the customer',
    async (status) => {
      const { stripe, sessionsCreate, subscriptionsList } = createStripeMock({
        withSubscriptions: true,
      });
      subscriptionsList.mockResolvedValue({
        data: [{ id: 'sub_blocking_1', status }],
      });
      const gateway = createGateway(stripe);

      await expect(
        gateway.createCheckoutSession({
          userId: appUserId,
          externalCustomerId: 'cus_123',
          ...createTestRenewalTerms('monthly'),
          successUrl: 'https://app/success',
          cancelUrl: 'https://app/cancel',
        }),
      ).rejects.toMatchObject({ code: 'ALREADY_SUBSCRIBED' });

      expect(subscriptionsList).toHaveBeenCalledWith({
        customer: 'cus_123',
        status: 'all',
        limit: SUBSCRIPTION_LIST_LIMIT,
      });
      expect(sessionsCreate).not.toHaveBeenCalled();
    },
  );

  it('creates a checkout session when Stripe subscriptions are only ended or canceled', async () => {
    const { stripe, sessionsCreate, subscriptionsList } = createStripeMock({
      withSubscriptions: true,
    });
    subscriptionsList.mockResolvedValue({
      data: [
        { id: 'sub_ended_1', status: 'canceled' as const },
        { id: 'sub_ended_2', status: 'incomplete_expired' as const },
      ],
    });
    const gateway = createGateway(stripe);

    await expect(
      gateway.createCheckoutSession({
        userId: appUserId,
        externalCustomerId: 'cus_123',
        ...createTestRenewalTerms('monthly'),
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout' });

    expect(subscriptionsList).toHaveBeenCalledWith({
      customer: 'cus_123',
      status: 'all',
      limit: SUBSCRIPTION_LIST_LIMIT,
    });
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing open checkout session when present', async () => {
    const {
      stripe,
      sessionsCreate,
      sessionsExpire,
      sessionsList,
      sessionsRetrieve,
    } = createStripeMock();
    sessionsList.mockResolvedValue({
      data: [{ id: 'cs_existing', url: 'https://stripe/existing-checkout' }],
    });
    sessionsRetrieve.mockResolvedValue({
      id: 'cs_existing',
      url: 'https://stripe/existing-checkout',
      metadata: createTestCheckoutRenewalMetadata({
        userId: appUserId,
        plan: 'annual',
      }),
      line_items: { data: [{ price: { id: 'price_a' } }] },
    });
    const gateway = createGateway(stripe);

    await expect(
      gateway.createCheckoutSession({
        userId: appUserId,
        externalCustomerId: 'cus_123',
        ...createTestRenewalTerms('annual'),
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).resolves.toEqual({ url: 'https://stripe/existing-checkout' });

    expect(sessionsList).toHaveBeenCalledWith({
      customer: 'cus_123',
      status: 'open',
      limit: 1,
    });
    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_existing', {
      expand: ['line_items'],
    });
    expect(sessionsExpire).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('expires an existing open checkout session when the plan does not match', async () => {
    const {
      stripe,
      sessionsCreate,
      sessionsExpire,
      sessionsList,
      sessionsRetrieve,
    } = createStripeMock();
    sessionsList.mockResolvedValue({
      data: [{ id: 'cs_existing', url: 'https://stripe/existing-checkout' }],
    });
    sessionsRetrieve.mockResolvedValue({
      id: 'cs_existing',
      url: 'https://stripe/existing-checkout',
      line_items: { data: [{ price: { id: 'price_a' } }] },
    });
    sessionsCreate.mockResolvedValue({
      id: 'cs_new',
      url: 'https://stripe/new-checkout',
    });
    const gateway = createGateway(stripe);

    await expect(
      gateway.createCheckoutSession({
        userId: appUserId,
        externalCustomerId: 'cus_123',
        ...createTestRenewalTerms('monthly'),
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).resolves.toEqual({ url: 'https://stripe/new-checkout' });

    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_existing', {
      expand: ['line_items'],
    });
    expect(sessionsExpire).toHaveBeenCalledWith('cs_existing', undefined, {
      idempotencyKey: 'expire_checkout_session:cs_existing',
    });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_m', quantity: 1 }],
      }),
      expect.objectContaining({
        idempotencyKey: `checkout_session:${appUserId}:monthly`,
      }),
    );
  });

  it('returns a new checkout session when inspecting an existing session fails', async () => {
    const logger = new FakeLogger();
    const {
      stripe,
      sessionsCreate,
      sessionsExpire,
      sessionsList,
      sessionsRetrieve,
    } = createStripeMock();
    sessionsList.mockResolvedValue({
      data: [{ id: 'cs_existing', url: 'https://stripe/existing-checkout' }],
    });
    sessionsRetrieve.mockRejectedValue(new Error('inspect failed'));
    sessionsCreate.mockResolvedValue({
      id: 'cs_new',
      url: 'https://stripe/new-checkout',
    });
    const gateway = createGateway(stripe, { logger });

    const result = await gateway.createCheckoutSession({
      userId: appUserId,
      externalCustomerId: 'cus_123',
      ...createTestRenewalTerms('monthly'),
      successUrl: 'https://app/success',
      cancelUrl: 'https://app/cancel',
    });

    expect(result).toEqual({ url: 'https://stripe/new-checkout' });

    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_existing', {
      expand: ['line_items'],
    });
    expect(sessionsExpire).toHaveBeenCalledWith('cs_existing', undefined, {
      idempotencyKey: 'expire_checkout_session:cs_existing',
    });
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    expect(logger.warnCalls).toContainEqual({
      context: expect.objectContaining({
        sessionId: 'cs_existing',
        error: 'inspect failed',
      }),
      msg: 'Failed to inspect existing checkout session',
    });
  });

  it('throws STRIPE_ERROR when expiring a mismatched checkout session fails', async () => {
    const logger = new FakeLogger();
    const {
      stripe,
      sessionsCreate,
      sessionsExpire,
      sessionsList,
      sessionsRetrieve,
    } = createStripeMock();
    sessionsList.mockResolvedValue({
      data: [{ id: 'cs_existing', url: 'https://stripe/existing-checkout' }],
    });
    sessionsRetrieve.mockResolvedValue({
      id: 'cs_existing',
      url: 'https://stripe/existing-checkout',
      line_items: {
        data: [{ price: { id: 'price_a' } }],
      },
    });
    sessionsExpire.mockRejectedValue(new Error('expire failed'));
    sessionsCreate.mockResolvedValue({
      id: 'cs_new',
      url: 'https://stripe/new-checkout',
    });
    const gateway = createGateway(stripe, { logger });

    await expect(
      gateway.createCheckoutSession({
        userId: appUserId,
        externalCustomerId: 'cus_123',
        ...createTestRenewalTerms('monthly'),
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });

    expect(sessionsExpire).toHaveBeenCalledTimes(1);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('throws STRIPE_ERROR when a checkout session URL is missing', async () => {
    const { stripe, sessionsCreate } = createStripeMock();
    sessionsCreate.mockResolvedValue({ id: 'cs_new', url: null });
    const gateway = createGateway(stripe);

    await expect(
      gateway.createCheckoutSession({
        userId: appUserId,
        externalCustomerId: 'cus_123',
        ...createTestRenewalTerms('monthly'),
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
  });

  it('creates a billing portal session with the correct Stripe parameters', async () => {
    const { stripe, portalSessionsCreate } = createStripeMock();
    const gateway = createGateway(stripe);

    await expect(
      gateway.createPortalSession({
        externalCustomerId: 'cus_123',
        returnUrl: 'https://app/return',
      }),
    ).resolves.toEqual({ url: 'https://stripe/portal' });

    expect(portalSessionsCreate).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://app/return',
    });
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
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
  });
});
