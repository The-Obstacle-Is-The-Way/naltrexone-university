import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { StripeCustomerRepository } from '@/src/application/ports/repositories';
import {
  createCheckoutSession,
  createPortalSession,
} from './billing-controller';

type UserLike = {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

type PaymentGatewayLike = {
  createCustomer: (input: {
    userId: string;
    clerkUserId: string;
    email: string;
  }) => Promise<{ stripeCustomerId: string }>;
  createCheckoutSession: (input: {
    userId: string;
    stripeCustomerId: string;
    plan: 'monthly' | 'annual';
    successUrl: string;
    cancelUrl: string;
  }) => Promise<{ url: string }>;
  createPortalSession: (input: {
    stripeCustomerId: string;
    returnUrl: string;
  }) => Promise<{ url: string }>;
};

function createUser(): UserLike {
  return {
    id: 'user_1',
    email: 'user@example.com',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
  };
}

function createDeps(overrides?: {
  user?: UserLike;
  appUrl?: string;
  clerkUserId?: string | null;
  stripeCustomerId?: string | null;
  authGateway?: Partial<AuthGateway>;
  paymentGateway?: Partial<PaymentGatewayLike>;
  stripeCustomerRepository?: Partial<StripeCustomerRepository>;
}) {
  const user = overrides?.user ?? createUser();
  const appUrl = overrides?.appUrl ?? 'https://app.example.com';
  const clerkUserId =
    overrides?.clerkUserId === undefined ? 'clerk_1' : overrides.clerkUserId;
  const stripeCustomerId =
    overrides?.stripeCustomerId === undefined
      ? 'cus_123'
      : overrides.stripeCustomerId;

  const authGateway: AuthGateway = {
    getCurrentUser: async () => user as never,
    requireUser: async () => user as never,
    ...overrides?.authGateway,
  };

  const stripeCustomerRepository: StripeCustomerRepository = {
    findByUserId: vi.fn(async () =>
      stripeCustomerId ? { stripeCustomerId } : null,
    ),
    insert: vi.fn(async () => undefined),
    ...overrides?.stripeCustomerRepository,
  };

  const paymentGateway: PaymentGatewayLike = {
    createCustomer: vi.fn(async () => ({
      stripeCustomerId: 'cus_new',
    })),
    createCheckoutSession: vi.fn(async () => ({
      url: 'https://stripe/checkout',
    })),
    createPortalSession: vi.fn(async () => ({
      url: 'https://stripe/portal',
    })),
    ...overrides?.paymentGateway,
  };

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
      const deps = createDeps({
        authGateway: {
          requireUser: async () => {
            throw new ApplicationError('UNAUTHENTICATED', 'No session');
          },
        },
      });

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
      const deps = createDeps({ stripeCustomerId: 'cus_existing' });

      const result = await createCheckoutSession(
        { plan: 'annual' },
        deps as never,
      );

      expect(result).toEqual({
        ok: true,
        data: { url: 'https://stripe/checkout' },
      });

      expect(deps.paymentGateway.createCustomer).not.toHaveBeenCalled();
      expect(deps.stripeCustomerRepository.insert).not.toHaveBeenCalled();

      expect(deps.paymentGateway.createCheckoutSession).toHaveBeenCalledWith({
        userId: 'user_1',
        stripeCustomerId: 'cus_existing',
        plan: 'annual',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
      });
    });

    it('creates stripe customer mapping when missing', async () => {
      const deps = createDeps({ stripeCustomerId: null });

      const result = await createCheckoutSession(
        { plan: 'monthly' },
        deps as never,
      );

      expect(result).toEqual({
        ok: true,
        data: { url: 'https://stripe/checkout' },
      });

      expect(deps.paymentGateway.createCustomer).toHaveBeenCalledWith({
        userId: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      });
      expect(deps.stripeCustomerRepository.insert).toHaveBeenCalledWith(
        'user_1',
        'cus_new',
      );
      expect(deps.paymentGateway.createCheckoutSession).toHaveBeenCalledWith({
        userId: 'user_1',
        stripeCustomerId: 'cus_new',
        plan: 'monthly',
        successUrl:
          'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
      });
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
      const deps = createDeps({
        authGateway: {
          requireUser: async () => {
            throw new ApplicationError('UNAUTHENTICATED', 'No session');
          },
        },
      });

      const result = await createPortalSession({}, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('returns NOT_FOUND when user has no stripe customer mapping', async () => {
      const deps = createDeps({ stripeCustomerId: null });

      const result = await createPortalSession({}, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
      expect(deps.paymentGateway.createPortalSession).not.toHaveBeenCalled();
    });

    it('creates a portal session when stripe customer mapping exists', async () => {
      const deps = createDeps({ stripeCustomerId: 'cus_existing' });

      const result = await createPortalSession({}, deps as never);

      expect(result).toEqual({
        ok: true,
        data: { url: 'https://stripe/portal' },
      });
      expect(deps.paymentGateway.createPortalSession).toHaveBeenCalledWith({
        stripeCustomerId: 'cus_existing',
        returnUrl: 'https://app.example.com/app/billing',
      });
    });
  });
});
