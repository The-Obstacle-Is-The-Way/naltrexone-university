// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSubscription } from '@/src/domain/test-helpers';
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

describe('CreateCheckoutSessionUseCase', () => {
  it('returns ALREADY_SUBSCRIBED when a subscription is still current', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_new',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    });

    const subscriptions = new FakeSubscriptionRepository([
      createSubscription({
        userId: 'user-1',
        status: 'pastDue',
        currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
      }),
    ]);

    const useCase = new CreateCheckoutSessionUseCase(
      new FakeStripeCustomerRepository(),
      subscriptions,
      paymentGateway,
      new FakeLogger(),
      () => new Date('2026-02-01T00:00:00Z'),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        clerkUserId: 'clerk-1',
        email: 'user@example.com',
        plan: 'monthly',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_SUBSCRIBED' });

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
        plan: 'annual',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
      },
    ]);
  });

  it('returns checkout URL and creates stripe customer mapping when missing', async () => {
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_new',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    });

    const stripeCustomers = new FakeStripeCustomerRepository();

    const useCase = new CreateCheckoutSessionUseCase(
      stripeCustomers,
      new FakeSubscriptionRepository(),
      paymentGateway,
      new FakeLogger(),
      () => new Date('2026-02-01T00:00:00Z'),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        clerkUserId: 'clerk-1',
        email: 'user@example.com',
        plan: 'monthly',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout' });

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
        plan: 'monthly',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
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
        plan: 'monthly',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
      },
      {
        userId: 'user-1',
        externalCustomerId: 'cus_winner',
        plan: 'monthly',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
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
    const paymentGateway = new FakePaymentGateway({
      externalCustomerId: 'cus_new',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    });
    const stripeCustomers = new FailingInsertStripeCustomerRepository();

    const useCase = new CreateCheckoutSessionUseCase(
      stripeCustomers,
      new FakeSubscriptionRepository(),
      paymentGateway,
      new FakeLogger(),
      () => new Date('2026-02-01T00:00:00Z'),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        clerkUserId: 'clerk-1',
        email: 'user@example.com',
        plan: 'monthly',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to persist Stripe customer mapping',
    });

    expect(paymentGateway.customerInputs).toHaveLength(1);
    expect(paymentGateway.checkoutInputs).toEqual([]);
  });
});
