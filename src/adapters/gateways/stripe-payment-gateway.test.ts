import { describe, expect, it, vi } from 'vitest';
import type {
  StripeBillingPortalSession,
  StripeCheckoutSession,
  StripeCheckoutSessionList,
  StripeCheckoutSessionRetrieved,
  StripeClient,
  StripeCustomer,
  StripeCustomerSearchResult,
  StripeSubscription,
  StripeSubscriptionListResult,
} from '@/src/adapters/shared/stripe-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { loadJsonFixture } from '@/tests/shared/load-json-fixture';
import { SUBSCRIPTION_LIST_LIMIT } from './stripe/stripe-checkout-sessions';
import { StripePaymentGateway } from './stripe-payment-gateway';

const TEST_WEBHOOK_SECRET = 'whsec_1';
const TEST_PRICE_IDS = { monthly: 'price_m', annual: 'price_a' } as const;

type StripeWebhookEventFixture<TObject> = {
  id: string;
  type: string;
  data: { object: TObject };
  [key: string]: unknown;
};

function createGateway(
  stripe: StripeClient,
  options?: { logger?: FakeLogger },
) {
  return new StripePaymentGateway({
    stripe,
    webhookSecret: TEST_WEBHOOK_SECRET,
    priceIds: TEST_PRICE_IDS,
    logger: options?.logger ?? new FakeLogger(),
  });
}

function createStripeMockBase() {
  const customersCreate = vi.fn(
    async () => ({ id: 'cus_123' }) as StripeCustomer,
  );
  const customersSearch = vi.fn(
    async () => ({ data: [] }) as StripeCustomerSearchResult,
  );
  const sessionsCreate = vi.fn(
    async () =>
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
  it('creates a Stripe customer with the correct Stripe parameters', async () => {
    const { stripe, customersCreate, customersSearch } = createStripeMock();
    const gateway = createGateway(stripe);

    await expect(
      gateway.createCustomer({
        userId: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      }),
    ).resolves.toEqual({ externalCustomerId: 'cus_123' });

    expect(customersCreate).toHaveBeenCalledWith(
      {
        email: 'user@example.com',
        metadata: { user_id: 'user_1', clerk_user_id: 'clerk_1' },
      },
      {
        idempotencyKey: 'create_stripe_customer:user_1',
      },
    );
    expect(customersSearch).toHaveBeenCalledWith({
      query: "metadata['user_id']:'user_1'",
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
        userId: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      }),
    ).resolves.toEqual({ externalCustomerId: 'cus_123' });

    expect(customersSearch).toHaveBeenCalledWith({
      query: "metadata['user_id']:'user_1'",
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
          userId: 'user_1',
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
    customersCreate.mockResolvedValue({ id: undefined });
    const gateway = createGateway(stripe);

    await expect(
      gateway.createCustomer({
        userId: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      }),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
  });

  it('creates a subscription checkout session with the correct Stripe parameters', async () => {
    const { stripe, sessionsCreate } = createStripeMock();
    const gateway = createGateway(stripe);

    await expect(
      gateway.createCheckoutSession({
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        plan: 'monthly',
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
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
        client_reference_id: 'user_1',
        subscription_data: {
          metadata: { user_id: 'user_1' },
        },
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^checkout_session:user_1:/),
      }),
    );
  });

  it.each([
    'active',
    'trialing',
    'past_due',
    'unpaid',
    'incomplete',
    'paused',
  ] as const)('throws ALREADY_SUBSCRIBED when Stripe has a %s subscription for the customer', async (status) => {
    const { stripe, sessionsCreate, subscriptionsList } = createStripeMock({
      withSubscriptions: true,
    });
    subscriptionsList.mockResolvedValue({
      data: [{ id: 'sub_blocking_1', status }],
    });
    const gateway = createGateway(stripe);

    await expect(
      gateway.createCheckoutSession({
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        plan: 'monthly',
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
  });

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
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        plan: 'monthly',
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
      line_items: { data: [{ price: { id: 'price_a' } }] },
    });
    const gateway = createGateway(stripe);

    await expect(
      gateway.createCheckoutSession({
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        plan: 'annual',
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
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        plan: 'monthly',
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).resolves.toEqual({ url: 'https://stripe/new-checkout' });

    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_existing', {
      expand: ['line_items'],
    });
    expect(sessionsExpire).toHaveBeenCalledWith('cs_existing', {
      idempotencyKey: 'expire_checkout_session:cs_existing',
    });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_m', quantity: 1 }],
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^checkout_session:user_1:/),
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
      userId: 'user_1',
      externalCustomerId: 'cus_123',
      plan: 'monthly',
      successUrl: 'https://app/success',
      cancelUrl: 'https://app/cancel',
    });

    expect(result).toEqual({ url: 'https://stripe/new-checkout' });

    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_existing', {
      expand: ['line_items'],
    });
    expect(sessionsExpire).toHaveBeenCalledWith('cs_existing', {
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
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        plan: 'monthly',
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
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        plan: 'monthly',
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

  it('verifies webhook signatures and normalizes subscription update events', async () => {
    const event = loadJsonFixture<
      StripeWebhookEventFixture<{ id: string; [key: string]: unknown }>
    >('stripe/customer.subscription.updated.json');
    const subscription = event.data.object;
    const { stripe, constructEvent, subscriptionsRetrieve } = createStripeMock({
      withSubscriptions: true,
    });
    constructEvent.mockReturnValue(event);
    subscriptionsRetrieve.mockResolvedValue(subscription);
    const gateway = createGateway(stripe);

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).resolves.toEqual({
      eventId: 'evt_1',
      type: 'customer.subscription.updated',
      subscriptionUpdate: {
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date(1_700_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });

    expect(constructEvent).toHaveBeenCalledWith('raw_body', 'sig_1', 'whsec_1');
    expect(subscriptionsRetrieve).toHaveBeenCalledWith('sub_123');
  });

  it('normalizes customer.subscription.trial_will_end events', async () => {
    const event = loadJsonFixture<
      StripeWebhookEventFixture<{ id: string; [key: string]: unknown }>
    >('stripe/customer.subscription.updated.json');
    const subscription = event.data.object;
    const constructedEvent = {
      ...event,
      id: 'evt_trial_will_end_1',
      type: 'customer.subscription.trial_will_end',
    };
    const { stripe, constructEvent, subscriptionsRetrieve } = createStripeMock({
      withSubscriptions: true,
    });
    constructEvent.mockReturnValue(constructedEvent);
    subscriptionsRetrieve.mockResolvedValue(event.data.object);
    const gateway = createGateway(stripe);

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).resolves.toEqual({
      eventId: 'evt_trial_will_end_1',
      type: 'customer.subscription.trial_will_end',
      subscriptionUpdate: {
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date(1_700_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });

    expect(subscriptionsRetrieve).toHaveBeenCalledWith(subscription.id);
  });

  it('normalizes customer.subscription.deleted events', async () => {
    const subscriptionEvent = loadJsonFixture<{
      data: { object: { id: string; status: string; [key: string]: unknown } };
    }>('stripe/customer.subscription.updated.json');

    const subscription = {
      ...subscriptionEvent.data.object,
      status: 'canceled',
    };

    const constructedEvent = {
      ...subscriptionEvent,
      id: 'evt_deleted_1',
      type: 'customer.subscription.deleted',
      data: {
        object: subscription,
      },
    };
    const { stripe, constructEvent, subscriptionsRetrieve } = createStripeMock({
      withSubscriptions: true,
    });
    constructEvent.mockReturnValue(constructedEvent);
    subscriptionsRetrieve.mockResolvedValue(subscription);
    const gateway = createGateway(stripe);

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).resolves.toEqual({
      eventId: 'evt_deleted_1',
      type: 'customer.subscription.deleted',
      subscriptionUpdate: expect.objectContaining({
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'canceled',
        currentPeriodEnd: new Date(1_700_000_000 * 1000),
        cancelAtPeriodEnd: false,
      }),
    });

    expect(subscriptionsRetrieve).toHaveBeenCalledWith(subscription.id);
  });

  it.each([
    ['checkout.session.completed', 'evt_checkout_1'],
    ['invoice.payment_failed', 'evt_invoice_1'],
    ['invoice.payment_succeeded', 'evt_invoice_success_1'],
    ['invoice.payment_action_required', 'evt_invoice_action_required_1'],
  ] as const)('normalizes %s events by retrieving the subscription', async (type, eventId) => {
    const subscriptionEvent = loadJsonFixture<{
      data: { object: { id: string } };
    }>('stripe/customer.subscription.updated.json');
    const subscription = subscriptionEvent.data.object;

    const constructedEvent = {
      id: eventId,
      type,
      data: {
        object: {
          subscription: subscription.id,
        },
      },
    };
    const { stripe, constructEvent, subscriptionsRetrieve } = createStripeMock({
      withSubscriptions: true,
    });
    constructEvent.mockReturnValue(constructedEvent);
    subscriptionsRetrieve.mockResolvedValue(subscription);
    const gateway = createGateway(stripe);

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).resolves.toEqual({
      eventId,
      type,
      subscriptionUpdate: {
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date(1_700_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });

    expect(subscriptionsRetrieve).toHaveBeenCalledWith(subscription.id);
  });

  it('throws INVALID_WEBHOOK_PAYLOAD when invoice.payment_failed payload shape is invalid', async () => {
    const constructedEvent = {
      id: 'evt_bad_invoice_payload',
      type: 'invoice.payment_failed',
      data: { object: { subscription: 123 } },
    };
    const logger = new FakeLogger();
    const { stripe, constructEvent } = createStripeMock();
    constructEvent.mockReturnValue(constructedEvent);
    const gateway = createGateway(stripe, { logger });

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });

    expect(logger.errorCalls).toContainEqual({
      context: expect.objectContaining({
        eventId: 'evt_bad_invoice_payload',
        type: 'invoice.payment_failed',
      }),
      msg: 'Invalid Stripe invoice.payment_failed webhook payload',
    });
  });

  it('throws INVALID_WEBHOOK_PAYLOAD when invoice.payment_failed subscription payload is invalid', async () => {
    const constructedEvent = {
      id: 'evt_bad_invoice_subscription_payload',
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_123' } },
    };
    const logger = new FakeLogger();
    const { stripe, constructEvent, subscriptionsRetrieve } = createStripeMock({
      withSubscriptions: true,
    });
    constructEvent.mockReturnValue(constructedEvent);
    subscriptionsRetrieve.mockResolvedValue({ id: 123 });
    const gateway = createGateway(stripe, { logger });

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });

    expect(subscriptionsRetrieve).toHaveBeenCalledWith('sub_123');
    expect(logger.errorCalls).toContainEqual({
      context: expect.objectContaining({
        eventId: 'evt_bad_invoice_subscription_payload',
        type: 'invoice.payment_failed',
        stripeSubscriptionId: 'sub_123',
      }),
      msg: 'Invalid Stripe subscription payload retrieved from invoice.payment_failed',
    });
  });

  it('ignores invoice.payment_failed events when no subscription is present', async () => {
    const constructedEvent = {
      id: 'evt_invoice_no_subscription',
      type: 'invoice.payment_failed',
      data: { object: { subscription: null } },
    };
    const { stripe, constructEvent } = createStripeMock();
    constructEvent.mockReturnValue(constructedEvent);
    const gateway = createGateway(stripe);

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).resolves.toEqual({
      eventId: 'evt_invoice_no_subscription',
      type: 'invoice.payment_failed',
    });
  });

  it('throws STRIPE_ERROR when invoice.payment_failed is missing the subscriptions client', async () => {
    const constructedEvent = {
      id: 'evt_invoice_no_subscriptions_client',
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_123' } },
    };
    const { stripe, constructEvent } = createStripeMock();
    constructEvent.mockReturnValue(constructedEvent);
    const gateway = createGateway(stripe);

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });
  });

  it('throws INVALID_WEBHOOK_PAYLOAD when checkout.session.completed payload shape is invalid', async () => {
    const constructedEvent = {
      id: 'evt_bad_checkout_payload',
      type: 'checkout.session.completed',
      data: { object: { subscription: 123 } },
    };
    const logger = new FakeLogger();
    const { stripe, constructEvent } = createStripeMock();
    constructEvent.mockReturnValue(constructedEvent);
    const gateway = createGateway(stripe, { logger });

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });

    expect(logger.errorCalls).toContainEqual({
      context: expect.objectContaining({
        eventId: 'evt_bad_checkout_payload',
        type: 'checkout.session.completed',
      }),
      msg: 'Invalid Stripe checkout.session.completed webhook payload',
    });
  });

  it('throws INVALID_WEBHOOK_PAYLOAD when checkout.session.completed subscription payload is invalid', async () => {
    const constructedEvent = {
      id: 'evt_bad_subscription_payload',
      type: 'checkout.session.completed',
      data: { object: { subscription: 'sub_123' } },
    };
    const logger = new FakeLogger();
    const { stripe, constructEvent, subscriptionsRetrieve } = createStripeMock({
      withSubscriptions: true,
    });
    constructEvent.mockReturnValue(constructedEvent);
    subscriptionsRetrieve.mockResolvedValue({ id: 123 });
    const gateway = createGateway(stripe, { logger });

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });

    expect(subscriptionsRetrieve).toHaveBeenCalledWith('sub_123');
    expect(logger.errorCalls).toContainEqual({
      context: expect.objectContaining({
        eventId: 'evt_bad_subscription_payload',
        type: 'checkout.session.completed',
        stripeSubscriptionId: 'sub_123',
      }),
      msg: 'Invalid Stripe subscription payload retrieved from checkout.session.completed',
    });
  });

  it('throws INVALID_WEBHOOK_PAYLOAD when subscription payload shape is invalid', async () => {
    const constructedEvent = {
      id: 'evt_bad',
      type: 'customer.subscription.updated',
      data: { object: { id: 123 } },
    };
    const { stripe, constructEvent } = createStripeMock();
    constructEvent.mockReturnValue(constructedEvent);
    const gateway = createGateway(stripe);

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_PAYLOAD' });
  });

  it('normalizes customer.subscription.paused events', async () => {
    const event = loadJsonFixture<
      StripeWebhookEventFixture<{ id: string; [key: string]: unknown }>
    >('stripe/customer.subscription.paused.json');
    const { stripe, constructEvent, subscriptionsRetrieve } = createStripeMock({
      withSubscriptions: true,
    });
    constructEvent.mockReturnValue(event);
    subscriptionsRetrieve.mockResolvedValue(event.data.object);
    const gateway = createGateway(stripe);

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).resolves.toEqual({
      eventId: 'evt_2',
      type: 'customer.subscription.paused',
      subscriptionUpdate: {
        userId: 'user_2',
        externalCustomerId: 'cus_456',
        externalSubscriptionId: 'sub_456',
        plan: 'annual',
        status: 'paused',
        currentPeriodEnd: new Date(1_700_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });

    expect(subscriptionsRetrieve).toHaveBeenCalledWith('sub_456');
  });

  it('normalizes customer.subscription.resumed events', async () => {
    const event = loadJsonFixture<
      StripeWebhookEventFixture<{ id: string; [key: string]: unknown }>
    >('stripe/customer.subscription.resumed.json');
    const { stripe, constructEvent, subscriptionsRetrieve } = createStripeMock({
      withSubscriptions: true,
    });
    constructEvent.mockReturnValue(event);
    subscriptionsRetrieve.mockResolvedValue(event.data.object);
    const gateway = createGateway(stripe);

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).resolves.toEqual({
      eventId: 'evt_3',
      type: 'customer.subscription.resumed',
      subscriptionUpdate: {
        userId: 'user_3',
        externalCustomerId: 'cus_789',
        externalSubscriptionId: 'sub_789',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date(1_700_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });

    expect(subscriptionsRetrieve).toHaveBeenCalledWith('sub_789');
  });

  it('normalizes customer.subscription.pending_update_applied events', async () => {
    const event = loadJsonFixture<
      StripeWebhookEventFixture<{ id: string; [key: string]: unknown }>
    >('stripe/customer.subscription.pending_update_applied.json');
    const { stripe, constructEvent, subscriptionsRetrieve } = createStripeMock({
      withSubscriptions: true,
    });
    constructEvent.mockReturnValue(event);
    subscriptionsRetrieve.mockResolvedValue(event.data.object);
    const gateway = createGateway(stripe);

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).resolves.toEqual({
      eventId: 'evt_4',
      type: 'customer.subscription.pending_update_applied',
      subscriptionUpdate: {
        userId: 'user_4',
        externalCustomerId: 'cus_901',
        externalSubscriptionId: 'sub_901',
        plan: 'annual',
        status: 'active',
        currentPeriodEnd: new Date(1_700_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });

    expect(subscriptionsRetrieve).toHaveBeenCalledWith('sub_901');
  });

  it('normalizes customer.subscription.pending_update_expired events', async () => {
    const event = loadJsonFixture<
      StripeWebhookEventFixture<{ id: string; [key: string]: unknown }>
    >('stripe/customer.subscription.pending_update_expired.json');
    const { stripe, constructEvent, subscriptionsRetrieve } = createStripeMock({
      withSubscriptions: true,
    });
    constructEvent.mockReturnValue(event);
    subscriptionsRetrieve.mockResolvedValue(event.data.object);
    const gateway = createGateway(stripe);

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).resolves.toEqual({
      eventId: 'evt_5',
      type: 'customer.subscription.pending_update_expired',
      subscriptionUpdate: {
        userId: 'user_5',
        externalCustomerId: 'cus_902',
        externalSubscriptionId: 'sub_902',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date(1_700_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });

    expect(subscriptionsRetrieve).toHaveBeenCalledWith('sub_902');
  });

  it('throws INVALID_WEBHOOK_SIGNATURE when webhook signature verification fails', async () => {
    const { stripe, constructEvent } = createStripeMock();
    constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const gateway = createGateway(stripe);

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });
  });

  it('includes original error message when webhook signature verification fails', async () => {
    const { stripe, constructEvent } = createStripeMock();
    constructEvent.mockImplementation(() => {
      throw new Error('Signature timestamp too old');
    });
    const gateway = createGateway(stripe);

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_SIGNATURE',
      message: expect.stringContaining('Signature timestamp too old'),
    });
  });

  it('calls logger.error when webhook verification fails', async () => {
    const { stripe, constructEvent } = createStripeMock();
    constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const logger = new FakeLogger();
    const gateway = createGateway(stripe, { logger });

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });

    expect(logger.errorCalls).toContainEqual({
      context: { error: 'Invalid signature' },
      msg: 'Webhook signature verification failed',
    });
  });

  it('throws when a subscription update event is missing required metadata.user_id', async () => {
    const subscription = {
      id: 'sub_123',
      customer: 'cus_123',
      status: 'active',
      cancel_at_period_end: false,
      metadata: {},
      items: {
        data: [
          {
            current_period_end: 1_700_000_000,
            price: { id: 'price_m' },
          },
        ],
      },
    };
    const logger = new FakeLogger();
    const { stripe, constructEvent, subscriptionsRetrieve } = createStripeMock({
      withSubscriptions: true,
    });
    constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: {
        object: subscription,
      },
    });
    subscriptionsRetrieve.mockResolvedValue(subscription);
    const gateway = createGateway(stripe, { logger });

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({
      code: 'STRIPE_ERROR',
      message: 'Stripe subscription metadata.user_id is required',
    });
    expect(subscriptionsRetrieve).toHaveBeenCalledWith('sub_123');
    expect(logger.errorCalls).toContainEqual({
      context: expect.objectContaining({
        eventId: 'evt_1',
        type: 'customer.subscription.updated',
        stripeSubscriptionId: 'sub_123',
        stripeCustomerId: 'cus_123',
      }),
      msg: 'Stripe subscription metadata.user_id is required',
    });
  });

  it('throws when customer.subscription.created events are missing metadata.user_id', async () => {
    const subscription = {
      id: 'sub_123',
      customer: 'cus_123',
      status: 'active',
      cancel_at_period_end: false,
      metadata: {},
      items: {
        data: [
          {
            current_period_end: 1_700_000_000,
            price: { id: 'price_m' },
          },
        ],
      },
    };
    const { stripe, constructEvent, subscriptionsRetrieve } = createStripeMock({
      withSubscriptions: true,
    });
    constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'customer.subscription.created',
      data: {
        object: subscription,
      },
    });
    subscriptionsRetrieve.mockResolvedValue(subscription);
    const logger = new FakeLogger();
    const gateway = createGateway(stripe, { logger });

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });

    expect(subscriptionsRetrieve).toHaveBeenCalledWith('sub_123');
    expect(logger.errorCalls).toContainEqual({
      context: expect.objectContaining({
        eventId: 'evt_1',
        stripeSubscriptionId: 'sub_123',
        stripeCustomerId: 'cus_123',
      }),
      msg: 'Stripe subscription metadata.user_id is required',
    });
  });

  it('throws when checkout.session.completed subscription metadata.user_id is missing', async () => {
    const subscriptionEvent = loadJsonFixture<{
      data: { object: { id: string; metadata?: Record<string, string> } };
    }>('stripe/customer.subscription.updated.json');
    const subscription = {
      ...subscriptionEvent.data.object,
      metadata: {},
    };

    const constructedEvent = {
      id: 'evt_checkout_missing_meta_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          subscription: subscription.id,
        },
      },
    };
    const { stripe, constructEvent, subscriptionsRetrieve } = createStripeMock({
      withSubscriptions: true,
    });
    constructEvent.mockReturnValue(constructedEvent);
    subscriptionsRetrieve.mockResolvedValue(subscription);
    const logger = new FakeLogger();
    const gateway = createGateway(stripe, { logger });

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).rejects.toMatchObject({ code: 'STRIPE_ERROR' });

    expect(subscriptionsRetrieve).toHaveBeenCalledWith('sub_123');
    expect(logger.errorCalls).toContainEqual({
      context: expect.objectContaining({
        eventId: 'evt_checkout_missing_meta_1',
        stripeSubscriptionId: 'sub_123',
        stripeCustomerId: 'cus_123',
      }),
      msg: 'Stripe subscription metadata.user_id is required',
    });
  });

  it('ignores checkout.session.completed events (no subscription update extracted)', async () => {
    const { stripe, constructEvent } = createStripeMock();
    constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_1' } },
    });
    const gateway = createGateway(stripe);

    await expect(
      gateway.processWebhookEvent('raw_body', 'sig_1'),
    ).resolves.toEqual({
      eventId: 'evt_1',
      type: 'checkout.session.completed',
    });
  });
});
