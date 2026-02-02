import { describe, expect, it } from 'vitest';
import type { PaymentGateway } from '@/src/application/ports/gateways';
import type { StripeCustomerRepository } from '@/src/application/ports/repositories';
import {
  FakeAuthGateway,
  FakePaymentGateway,
} from '@/src/application/test-helpers/fakes';
import type { User } from '@/src/domain/entities';
import { createUser } from '@/src/domain/test-helpers';
import {
  createCheckoutSession,
  createPortalSession,
} from './billing-controller';

class CapturingStripeCustomerRepository implements StripeCustomerRepository {
  readonly findInputs: string[] = [];
  readonly insertInputs: Array<{ userId: string; stripeCustomerId: string }> =
    [];

  private readonly stripeCustomerIdByUserId = new Map<string, string>();

  constructor(seed?: { userId: string; stripeCustomerId: string } | null) {
    if (seed) {
      this.stripeCustomerIdByUserId.set(seed.userId, seed.stripeCustomerId);
    }
  }

  async findByUserId(
    userId: string,
  ): Promise<{ stripeCustomerId: string } | null> {
    this.findInputs.push(userId);
    const stripeCustomerId = this.stripeCustomerIdByUserId.get(userId);
    return stripeCustomerId ? { stripeCustomerId } : null;
  }

  async insert(userId: string, stripeCustomerId: string): Promise<void> {
    this.insertInputs.push({ userId, stripeCustomerId });
    this.stripeCustomerIdByUserId.set(userId, stripeCustomerId);
  }
}

function createDeps(overrides?: {
  user?: User | null;
  appUrl?: string;
  clerkUserId?: string | null;
  stripeCustomerId?: string | null;
  paymentGateway?: PaymentGateway;
  stripeCustomerRepository?: StripeCustomerRepository;
}) {
  const user =
    overrides?.user === undefined
      ? createUser({
          id: 'user_1',
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        })
      : overrides.user;

  const appUrl = overrides?.appUrl ?? 'https://app.example.com';
  const clerkUserId =
    overrides?.clerkUserId === undefined ? 'clerk_1' : overrides.clerkUserId;

  const authGateway = new FakeAuthGateway(user);

  const stripeCustomerRepository =
    overrides?.stripeCustomerRepository ??
    new CapturingStripeCustomerRepository(
      overrides?.stripeCustomerId === undefined
        ? { userId: 'user_1', stripeCustomerId: 'cus_123' }
        : overrides.stripeCustomerId
          ? { userId: 'user_1', stripeCustomerId: overrides.stripeCustomerId }
          : null,
    );

  const paymentGateway =
    overrides?.paymentGateway ??
    new FakePaymentGateway({
      stripeCustomerId: 'cus_new',
      checkoutUrl: 'https://stripe/checkout',
      portalUrl: 'https://stripe/portal',
      webhookResult: {
        eventId: 'evt_1',
        type: 'checkout.session.completed',
      },
    });

  return {
    authGateway,
    stripeCustomerRepository,
    paymentGateway,
    getClerkUserId: async () => clerkUserId,
    appUrl,
  };
}

describe('billing-controller', () => {
  describe('createCheckoutSession', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await createCheckoutSession(
        { plan: 'weekly' },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { plan: expect.any(Array) },
        },
      });
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await createCheckoutSession(
        { plan: 'monthly' },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('uses existing stripe customer mapping when available', async () => {
      const paymentGateway = new FakePaymentGateway({
        stripeCustomerId: 'cus_new',
        checkoutUrl: 'https://stripe/checkout',
        portalUrl: 'https://stripe/portal',
        webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
      });

      const stripeCustomerRepository = new CapturingStripeCustomerRepository({
        userId: 'user_1',
        stripeCustomerId: 'cus_existing',
      });

      const deps = createDeps({
        stripeCustomerRepository,
        paymentGateway,
        stripeCustomerId: 'cus_existing',
      });

      const result = await createCheckoutSession(
        { plan: 'annual' },
        deps as never,
      );

      expect(result).toEqual({
        ok: true,
        data: { url: 'https://stripe/checkout' },
      });

      expect(paymentGateway.customerInputs).toEqual([]);
      expect(stripeCustomerRepository.insertInputs).toEqual([]);

      expect(paymentGateway.checkoutInputs).toEqual([
        {
          userId: 'user_1',
          stripeCustomerId: 'cus_existing',
          plan: 'annual',
          successUrl:
            'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
          cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
        },
      ]);
    });

    it('creates stripe customer mapping when missing', async () => {
      const paymentGateway = new FakePaymentGateway({
        stripeCustomerId: 'cus_new',
        checkoutUrl: 'https://stripe/checkout',
        portalUrl: 'https://stripe/portal',
        webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
      });

      const stripeCustomerRepository = new CapturingStripeCustomerRepository(
        null,
      );

      const deps = createDeps({
        stripeCustomerRepository,
        paymentGateway,
        stripeCustomerId: null,
      });

      const result = await createCheckoutSession(
        { plan: 'monthly' },
        deps as never,
      );

      expect(result).toEqual({
        ok: true,
        data: { url: 'https://stripe/checkout' },
      });

      expect(paymentGateway.customerInputs).toEqual([
        {
          userId: 'user_1',
          clerkUserId: 'clerk_1',
          email: 'user@example.com',
        },
      ]);
      expect(stripeCustomerRepository.insertInputs).toEqual([
        { userId: 'user_1', stripeCustomerId: 'cus_new' },
      ]);
      expect(paymentGateway.checkoutInputs).toEqual([
        {
          userId: 'user_1',
          stripeCustomerId: 'cus_new',
          plan: 'monthly',
          successUrl:
            'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
          cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
        },
      ]);
    });
  });

  describe('createPortalSession', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await createPortalSession(undefined, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await createPortalSession({}, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('returns NOT_FOUND when user has no stripe customer mapping', async () => {
      const paymentGateway = new FakePaymentGateway({
        stripeCustomerId: 'cus_new',
        checkoutUrl: 'https://stripe/checkout',
        portalUrl: 'https://stripe/portal',
        webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
      });

      const deps = createDeps({
        stripeCustomerId: null,
        stripeCustomerRepository: new CapturingStripeCustomerRepository(null),
        paymentGateway,
      });

      const result = await createPortalSession({}, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
      expect(paymentGateway.portalInputs).toEqual([]);
    });

    it('creates a portal session when stripe customer mapping exists', async () => {
      const paymentGateway = new FakePaymentGateway({
        stripeCustomerId: 'cus_new',
        checkoutUrl: 'https://stripe/checkout',
        portalUrl: 'https://stripe/portal',
        webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
      });

      const deps = createDeps({
        stripeCustomerId: 'cus_existing',
        stripeCustomerRepository: new CapturingStripeCustomerRepository({
          userId: 'user_1',
          stripeCustomerId: 'cus_existing',
        }),
        paymentGateway,
      });

      const result = await createPortalSession({}, deps as never);

      expect(result).toEqual({
        ok: true,
        data: { url: 'https://stripe/portal' },
      });
      expect(paymentGateway.portalInputs).toEqual([
        {
          stripeCustomerId: 'cus_existing',
          returnUrl: 'https://app.example.com/app/billing',
        },
      ]);
    });
  });
});
