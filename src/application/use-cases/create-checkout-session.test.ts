// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSubscription } from '@/src/domain/test-helpers';
import type { SubscriptionStatus } from '@/src/domain/value-objects';
import { ApplicationError } from '../errors';
import {
  FakeLogger,
  FakePaymentGateway,
  FakeStripeCustomerRepository,
  FakeSubscriptionRepository,
} from '../test-helpers/fakes';
import { CreateCheckoutSessionUseCase } from './create-checkout-session';

class SequencedFakePaymentGateway extends FakePaymentGateway {
  constructor(private readonly externalCustomerIds: string[]) {
    super({
      externalCustomerId: externalCustomerIds[0] ?? 'cus_unused',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    });
  }

  override async createCustomer(
    input: Parameters<FakePaymentGateway['createCustomer']>[0],
    options?: Parameters<FakePaymentGateway['createCustomer']>[1],
  ) {
    this.customerInputs.push(input);
    this.customerOptions.push(options);

    const externalCustomerId = this.externalCustomerIds.shift();
    if (!externalCustomerId) {
      throw new Error('Missing external customer id test fixture');
    }

    return { externalCustomerId };
  }
}

class ConcurrentCreateRaceStripeCustomerRepository extends FakeStripeCustomerRepository {
  private initialMissCount = 0;
  private resolveBarrier: (() => void) | null = null;
  private readonly barrier = new Promise<void>((resolve) => {
    this.resolveBarrier = resolve;
  });

  override async findByUserId(
    userId: string,
  ): Promise<{ stripeCustomerId: string } | null> {
    const existing = await super.findByUserId(userId);
    if (existing) {
      return existing;
    }

    this.initialMissCount++;
    if (this.initialMissCount <= 2) {
      if (this.initialMissCount === 2) {
        this.resolveBarrier?.();
      }

      await this.barrier;
    }

    return null;
  }
}

class FailingInsertStripeCustomerRepository extends FakeStripeCustomerRepository {
  override async insert(): Promise<void> {
    throw new ApplicationError(
      'INTERNAL_ERROR',
      'Failed to persist Stripe customer mapping',
    );
  }
}

class EmptyAfterConflictStripeCustomerRepository extends FakeStripeCustomerRepository {
  override async findByUserId(_userId: string): Promise<null> {
    return null;
  }

  override async insert(): Promise<void> {
    throw new ApplicationError(
      'CONFLICT',
      'Stripe customer already exists with a different stripeCustomerId',
    );
  }
}

const defaultCheckoutInput = {
  userId: 'user-1',
  clerkUserId: 'clerk-1',
  email: 'user@example.com',
  plan: 'monthly' as const,
  successUrl:
    'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
};

const getRenewalTerms = (plan: 'monthly' | 'annual', hasTrial: boolean) => ({
  plan,
  amountCents: plan === 'monthly' ? 2900 : 19900,
  currency: 'usd' as const,
  frequency: plan === 'monthly' ? ('month' as const) : ('year' as const),
  disclosureVersion: '2026-08-05',
  termsVersion: '2026-08-05',
  termsHash: 'terms-hash',
  disclosureSnapshot: hasTrial
    ? 'Exact trial renewal disclosure.'
    : 'Exact immediate renewal disclosure.',
  cancellationMethod: 'Billing page in the app or support@addictionboards.com',
});

function createPaymentGateway() {
  return new FakePaymentGateway({
    externalCustomerId: 'cus_new',
    checkoutUrl: 'https://stripe/checkout',
    portalUrl: 'https://stripe/portal',
    webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
  });
}

async function createUseCaseWithExistingCustomer(input: {
  status?: SubscriptionStatus;
  currentPeriodEnd?: Date;
}) {
  const paymentGateway = createPaymentGateway();
  const stripeCustomers = new FakeStripeCustomerRepository();
  await stripeCustomers.insert('user-1', 'cus_existing');

  const subscriptions =
    input.status && input.currentPeriodEnd
      ? new FakeSubscriptionRepository([
          createSubscription({
            userId: 'user-1',
            status: input.status,
            currentPeriodEnd: input.currentPeriodEnd,
          }),
        ])
      : new FakeSubscriptionRepository();

  return {
    paymentGateway,
    useCase: new CreateCheckoutSessionUseCase(
      stripeCustomers,
      subscriptions,
      paymentGateway,
      new FakeLogger(),
      () => new Date('2026-02-01T00:00:00Z'),
      getRenewalTerms,
    ),
  };
}

// A use case on 2026-02-01, over the given repositories and renewal terms.
function createUseCase(
  deps: {
    stripeCustomers?: FakeStripeCustomerRepository;
    subscriptions?: FakeSubscriptionRepository;
    renewalTerms?: typeof getRenewalTerms;
  } = {},
) {
  const paymentGateway = createPaymentGateway();
  const useCase = new CreateCheckoutSessionUseCase(
    deps.stripeCustomers ?? new FakeStripeCustomerRepository(),
    deps.subscriptions ?? new FakeSubscriptionRepository(),
    paymentGateway,
    new FakeLogger(),
    () => new Date('2026-02-01T00:00:00Z'),
    deps.renewalTerms ?? getRenewalTerms,
  );
  return { paymentGateway, useCase };
}

describe('CreateCheckoutSessionUseCase', () => {
  it.each([
    { status: null, expectedTrial: true, version: '2026-01-01' },
    { status: 'canceled' as const, expectedTrial: true, version: '2026-08-05' },
    { status: null, expectedTrial: false, version: '2026-08-05' },
  ])(
    'rejects stale displayed consent before provider effects: $status/$expectedTrial/$version',
    async ({ status, expectedTrial, version }) => {
      const payments = createPaymentGateway();
      const useCase = new CreateCheckoutSessionUseCase(
        new FakeStripeCustomerRepository(),
        new FakeSubscriptionRepository(
          status ? [createSubscription({ userId: 'user-1', status })] : [],
        ),
        payments,
        new FakeLogger(),
        () => new Date('2026-02-01T00:00:00Z'),
        getRenewalTerms,
      );
      await expect(
        useCase.execute({
          ...defaultCheckoutInput,
          expectedOffer: {
            hasTrial: expectedTrial,
            disclosureVersion: version,
          },
        }),
      ).rejects.toEqual(
        new ApplicationError(
          'VALIDATION_ERROR',
          'The displayed subscription offer has changed. Review the current terms before continuing.',
        ),
      );
      expect(payments.customerInputs).toEqual([]);
      expect(payments.checkoutInputs).toEqual([]);
    },
  );

  it.each([true, false])(
    'creates Checkout when the displayed trial=%s offer still matches',
    async (hasTrial) => {
      const { useCase, paymentGateway } =
        await createUseCaseWithExistingCustomer(
          hasTrial
            ? {}
            : {
                status: 'canceled',
                currentPeriodEnd: new Date('2026-01-01T00:00:00Z'),
              },
        );
      await expect(
        useCase.execute({
          ...defaultCheckoutInput,
          expectedOffer: { hasTrial, disclosureVersion: '2026-08-05' },
        }),
      ).resolves.toEqual({ url: 'https://stripe/checkout' });
      expect(paymentGateway.checkoutInputs[0]).toMatchObject(
        getRenewalTerms('monthly', hasTrial),
      );
    },
  );

  it('allows checkout when local row is canceled even with future currentPeriodEnd', async () => {
    const { paymentGateway, useCase } = await createUseCaseWithExistingCustomer(
      {
        status: 'canceled',
        currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
      },
    );

    await expect(useCase.execute(defaultCheckoutInput)).resolves.toEqual({
      url: 'https://stripe/checkout',
    });

    expect(paymentGateway.checkoutInputs).toEqual([
      {
        userId: 'user-1',
        externalCustomerId: 'cus_existing',
        ...getRenewalTerms('monthly', false),
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
      },
    ]);
    expect(paymentGateway.checkoutInputs[0]).not.toHaveProperty(
      'trialPeriodDays',
    );
  });

  it('allows checkout when local row is paymentFailed even with future currentPeriodEnd', async () => {
    const { paymentGateway, useCase } = await createUseCaseWithExistingCustomer(
      {
        status: 'paymentFailed',
        currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
      },
    );

    await expect(useCase.execute(defaultCheckoutInput)).resolves.toEqual({
      url: 'https://stripe/checkout',
    });

    expect(paymentGateway.checkoutInputs).toHaveLength(1);
    expect(paymentGateway.checkoutInputs[0]).not.toHaveProperty(
      'trialPeriodDays',
    );
  });

  it('continues to block checkout when local row is active with future currentPeriodEnd', async () => {
    const { paymentGateway, useCase } = await createUseCaseWithExistingCustomer(
      {
        status: 'active',
        currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
      },
    );

    await expect(useCase.execute(defaultCheckoutInput)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    expect(paymentGateway.checkoutInputs).toEqual([]);
  });

  it('continues to block checkout when local row is pastDue with future currentPeriodEnd', async () => {
    const { paymentGateway, useCase } = await createUseCaseWithExistingCustomer(
      {
        status: 'pastDue',
        currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
      },
    );

    await expect(useCase.execute(defaultCheckoutInput)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    expect(paymentGateway.checkoutInputs).toEqual([]);
  });

  it('continues to block checkout when local row is paused with future currentPeriodEnd', async () => {
    const { paymentGateway, useCase } = await createUseCaseWithExistingCustomer(
      {
        status: 'paused',
        currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
      },
    );

    await expect(useCase.execute(defaultCheckoutInput)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    expect(paymentGateway.checkoutInputs).toEqual([]);
  });

  it('continues to allow checkout when no subscription row exists', async () => {
    const { paymentGateway, useCase } = await createUseCaseWithExistingCustomer(
      {},
    );

    await expect(useCase.execute(defaultCheckoutInput)).resolves.toEqual({
      url: 'https://stripe/checkout',
    });

    expect(paymentGateway.checkoutInputs).toEqual([
      expect.objectContaining({
        userId: 'user-1',
        externalCustomerId: 'cus_existing',
        ...getRenewalTerms('monthly', true),
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
        trialPeriodDays: 7,
        disclosureSnapshot: 'Exact trial renewal disclosure.',
        cancellationMethod:
          'Billing page in the app or support@addictionboards.com',
      }),
    ]);
  });

  it('passes a 7-day trial to the gateway for a first-time user', async () => {
    const paymentGateway = createPaymentGateway();
    const stripeCustomers = new FakeStripeCustomerRepository();
    await stripeCustomers.insert('user-1', 'cus_existing');

    const useCase = new CreateCheckoutSessionUseCase(
      stripeCustomers,
      new FakeSubscriptionRepository(),
      paymentGateway,
      new FakeLogger(),
      () => new Date('2026-02-01T00:00:00Z'),
      getRenewalTerms,
    );

    await expect(useCase.execute(defaultCheckoutInput)).resolves.toEqual({
      url: 'https://stripe/checkout',
    });

    expect(paymentGateway.checkoutInputs).toEqual([
      {
        userId: 'user-1',
        externalCustomerId: 'cus_existing',
        ...getRenewalTerms('monthly', true),
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
        trialPeriodDays: 7,
      },
    ]);
  });

  it('does not pass a trial to the gateway for a user with an existing subscription row', async () => {
    const paymentGateway = createPaymentGateway();
    const stripeCustomers = new FakeStripeCustomerRepository();
    await stripeCustomers.insert('user-1', 'cus_existing');
    const subscriptions = new FakeSubscriptionRepository([
      createSubscription({
        userId: 'user-1',
        status: 'canceled',
        currentPeriodEnd: new Date('2026-01-01T00:00:00Z'),
      }),
    ]);

    const useCase = new CreateCheckoutSessionUseCase(
      stripeCustomers,
      subscriptions,
      paymentGateway,
      new FakeLogger(),
      () => new Date('2026-02-01T00:00:00Z'),
      getRenewalTerms,
    );

    await expect(useCase.execute(defaultCheckoutInput)).resolves.toEqual({
      url: 'https://stripe/checkout',
    });

    expect(paymentGateway.checkoutInputs).toHaveLength(1);
    expect(paymentGateway.checkoutInputs[0]).not.toHaveProperty(
      'trialPeriodDays',
    );
  });

  it('continues to allow checkout when currentPeriodEnd is in the past', async () => {
    const { paymentGateway, useCase } = await createUseCaseWithExistingCustomer(
      {
        status: 'active',
        currentPeriodEnd: new Date('2026-01-01T00:00:00Z'),
      },
    );

    await expect(useCase.execute(defaultCheckoutInput)).resolves.toEqual({
      url: 'https://stripe/checkout',
    });

    expect(paymentGateway.checkoutInputs).toHaveLength(1);
    expect(paymentGateway.checkoutInputs[0]).not.toHaveProperty(
      'trialPeriodDays',
    );
  });

  it('returns ALREADY_SUBSCRIBED when a subscription is still current', async () => {
    const { paymentGateway, useCase } = createUseCase({
      subscriptions: new FakeSubscriptionRepository([
        createSubscription({
          userId: 'user-1',
          status: 'pastDue',
          currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
        }),
      ]),
    });

    await expect(useCase.execute(defaultCheckoutInput)).rejects.toEqual(
      new ApplicationError(
        'ALREADY_SUBSCRIBED',
        'Subscription already exists for this user',
      ),
    );

    expect(paymentGateway.customerInputs).toEqual([]);
    expect(paymentGateway.checkoutInputs).toEqual([]);
  });

  it('keeps blocking current subscriptions from starting another checkout', async () => {
    const paymentGateway = createPaymentGateway();
    const subscriptions = new FakeSubscriptionRepository([
      createSubscription({
        userId: 'user-1',
        status: 'inTrial',
        currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
      }),
    ]);

    const useCase = new CreateCheckoutSessionUseCase(
      new FakeStripeCustomerRepository(),
      subscriptions,
      paymentGateway,
      new FakeLogger(),
      () => new Date('2026-02-01T00:00:00Z'),
      getRenewalTerms,
    );

    await expect(useCase.execute(defaultCheckoutInput)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    });

    expect(paymentGateway.customerInputs).toEqual([]);
    expect(paymentGateway.checkoutInputs).toEqual([]);
  });

  it('returns checkout URL when stripe customer mapping exists', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_should_not_be_used',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    });

    const stripeCustomers = new FakeStripeCustomerRepository();
    await stripeCustomers.insert('user-1', 'cus_existing');

    const useCase = new CreateCheckoutSessionUseCase(
      stripeCustomers,
      new FakeSubscriptionRepository(),
      paymentGateway,
      new FakeLogger(),
      () => new Date('2026-02-01T00:00:00Z'),
      getRenewalTerms,
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        clerkUserId: null,
        email: 'user@example.com',
        plan: 'annual',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout' });

    expect(paymentGateway.customerInputs).toEqual([]);
    expect(paymentGateway.checkoutInputs).toEqual([
      {
        userId: 'user-1',
        externalCustomerId: 'cus_existing',
        ...getRenewalTerms('annual', true),
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
        trialPeriodDays: 7,
      },
    ]);
  });

  it('returns checkout URL and creates stripe customer mapping when missing', async () => {
    const stripeCustomers = new FakeStripeCustomerRepository();
    const { paymentGateway, useCase } = createUseCase({ stripeCustomers });

    await expect(useCase.execute(defaultCheckoutInput)).resolves.toEqual({
      url: 'https://stripe/checkout',
    });

    await expect(stripeCustomers.findByUserId('user-1')).resolves.toEqual({
      stripeCustomerId: 'cus_new',
    });

    expect(paymentGateway.customerInputs).toEqual([
      {
        userId: 'user-1',
        clerkUserId: 'clerk-1',
        email: 'user@example.com',
      },
    ]);
    expect(paymentGateway.customerOptions).toEqual([
      { idempotencyKey: 'create_stripe_customer:user-1' },
    ]);
    expect(paymentGateway.checkoutInputs).toEqual([
      {
        userId: 'user-1',
        externalCustomerId: 'cus_new',
        ...getRenewalTerms('monthly', true),
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
        trialPeriodDays: 7,
      },
    ]);
  });

  it('adopts winner mapping when concurrent create races on same user', async () => {
    const paymentGateway = new SequencedFakePaymentGateway([
      'cus_winner',
      'cus_orphan',
    ]);
    const stripeCustomers = new ConcurrentCreateRaceStripeCustomerRepository();

    const useCase = new CreateCheckoutSessionUseCase(
      stripeCustomers,
      new FakeSubscriptionRepository(),
      paymentGateway,
      new FakeLogger(),
      () => new Date('2026-02-01T00:00:00Z'),
      getRenewalTerms,
    );

    const input = {
      userId: 'user-1',
      clerkUserId: 'clerk-1',
      email: 'user@example.com',
      plan: 'monthly' as const,
      successUrl:
        'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
    };

    await expect(
      Promise.all([useCase.execute(input), useCase.execute(input)]),
    ).resolves.toEqual([
      { url: 'https://stripe/checkout' },
      { url: 'https://stripe/checkout' },
    ]);

    await expect(stripeCustomers.findByUserId('user-1')).resolves.toEqual({
      stripeCustomerId: 'cus_winner',
    });

    expect(paymentGateway.customerInputs).toHaveLength(2);
    expect(paymentGateway.customerOptions).toEqual([
      { idempotencyKey: 'create_stripe_customer:user-1' },
      { idempotencyKey: 'create_stripe_customer:user-1' },
    ]);
    expect(paymentGateway.checkoutInputs).toEqual([
      {
        userId: 'user-1',
        externalCustomerId: 'cus_winner',
        ...getRenewalTerms('monthly', true),
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
        trialPeriodDays: 7,
      },
      {
        userId: 'user-1',
        externalCustomerId: 'cus_winner',
        ...getRenewalTerms('monthly', true),
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
        trialPeriodDays: 7,
      },
    ]);
  });

  it('logs orphaned customer at warn level when losing race', async () => {
    const paymentGateway = new SequencedFakePaymentGateway([
      'cus_winner',
      'cus_orphan',
    ]);
    const stripeCustomers = new ConcurrentCreateRaceStripeCustomerRepository();
    const logger = new FakeLogger();

    const useCase = new CreateCheckoutSessionUseCase(
      stripeCustomers,
      new FakeSubscriptionRepository(),
      paymentGateway,
      logger,
      () => new Date('2026-02-01T00:00:00Z'),
      getRenewalTerms,
    );

    const input = {
      userId: 'user-1',
      clerkUserId: 'clerk-1',
      email: 'user@example.com',
      plan: 'monthly' as const,
      successUrl:
        'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
    };

    await Promise.all([useCase.execute(input), useCase.execute(input)]);

    expect(logger.warnCalls).toEqual([
      {
        context: {
          userId: 'user-1',
          canonicalStripeCustomerId: 'cus_winner',
          orphanedStripeCustomerId: 'cus_orphan',
        },
        msg: 'Discarded orphaned Stripe customer created during concurrent mapping race',
      },
    ]);
  });

  it('rethrows non-CONFLICT errors from insert', async () => {
    const stripeCustomers = new FailingInsertStripeCustomerRepository();
    const { paymentGateway, useCase } = createUseCase({ stripeCustomers });

    await expect(useCase.execute(defaultCheckoutInput)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to persist Stripe customer mapping',
    });

    expect(paymentGateway.customerInputs).toHaveLength(1);
    expect(paymentGateway.checkoutInputs).toEqual([]);
  });

  it('throws INTERNAL_ERROR with CONFLICT cause when mapping is still missing after conflict reread', async () => {
    const stripeCustomers = new EmptyAfterConflictStripeCustomerRepository();
    const { paymentGateway, useCase } = createUseCase({ stripeCustomers });

    const promise = useCase.execute(defaultCheckoutInput);

    await expect(promise).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Stripe customer mapping disappeared after conflict',
      cause: expect.objectContaining({
        code: 'CONFLICT',
        message:
          'Stripe customer already exists with a different stripeCustomerId',
      }),
    });

    await expect(stripeCustomers.findByUserId('user-1')).resolves.toBeNull();
    expect(paymentGateway.customerInputs).toHaveLength(1);
    expect(paymentGateway.checkoutInputs).toEqual([]);
  });

  it('allows checkout when the current period ends exactly now', async () => {
    const { paymentGateway, useCase } = await createUseCaseWithExistingCustomer(
      {
        status: 'active',
        currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
      },
    );

    await expect(useCase.execute(defaultCheckoutInput)).resolves.toEqual({
      url: 'https://stripe/checkout',
    });
    expect(paymentGateway.checkoutInputs).toHaveLength(1);
  });

  it('requires a Clerk user id to create a missing Stripe customer', async () => {
    const { paymentGateway, useCase } = createUseCase();

    await expect(
      useCase.execute({ ...defaultCheckoutInput, clerkUserId: null }),
    ).rejects.toEqual(
      new ApplicationError('INTERNAL_ERROR', 'Clerk user id is required'),
    );
    expect(paymentGateway.customerInputs).toEqual([]);
    expect(paymentGateway.checkoutInputs).toEqual([]);
  });

  // The renewal terms are the disclosure the learner consents to; terms for
  // another plan would disclose the wrong price.
  it('refuses renewal terms for a plan other than the one selected', async () => {
    const { paymentGateway, useCase } = createUseCase({
      renewalTerms: (_plan, hasTrial) => getRenewalTerms('annual', hasTrial),
    });

    await expect(useCase.execute(defaultCheckoutInput)).rejects.toEqual(
      new ApplicationError(
        'INTERNAL_ERROR',
        'Checkout renewal terms do not match the selected plan',
      ),
    );
    expect(paymentGateway.customerInputs).toEqual([]);
    expect(paymentGateway.checkoutInputs).toEqual([]);
  });

  it('passes the request key to Checkout, and no request options without one', async () => {
    const { paymentGateway, useCase } = await createUseCaseWithExistingCustomer(
      {},
    );

    await useCase.execute({ ...defaultCheckoutInput, idempotencyKey: 'req-1' });
    await useCase.execute(defaultCheckoutInput);

    expect(paymentGateway.checkoutOptions).toStrictEqual([
      { idempotencyKey: 'req-1' },
      undefined,
    ]);
  });
});
