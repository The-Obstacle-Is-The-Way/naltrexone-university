// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { RateLimiter } from '@/src/application/ports/gateways';
import {
  FakeAuthGateway,
  FakeCreateCheckoutSessionUseCase,
  FakeCreatePortalSessionUseCase,
  FakeIdempotencyKeyRepository,
  FakeLogger,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
import type {
  CreateCheckoutSessionOutput,
  CreatePortalSessionOutput,
} from '@/src/application/use-cases';
import type { User } from '@/src/domain/entities';
import { createUser } from '@/src/domain/test-helpers';
import {
  type BillingControllerDeps,
  createCheckoutSession,
  createPortalSession,
} from './billing-controller';

type BillingControllerTestDeps = BillingControllerDeps & {
  createCheckoutSessionUseCase: FakeCreateCheckoutSessionUseCase;
  createPortalSessionUseCase: FakeCreatePortalSessionUseCase;
  _calls: {
    clerkCalls: Array<undefined>;
  };
  _fixtures: {
    userId: string;
  };
};

function createDeps(overrides?: {
  user?: User | null;
  appUrl?: string;
  clerkUserId?: string | null;
  checkoutOutput?: CreateCheckoutSessionOutput;
  checkoutThrows?: unknown;
  portalOutput?: CreatePortalSessionOutput;
  portalThrows?: unknown;
  rateLimiter?: RateLimiter;
  now?: () => Date;
}): BillingControllerTestDeps {
  const user =
    overrides?.user === undefined
      ? createUser({
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        })
      : overrides.user;
  const userId = user?.id ?? crypto.randomUUID();

  const appUrl = overrides?.appUrl ?? 'https://app.example.com';
  const clerkUserId =
    overrides?.clerkUserId === undefined ? 'clerk_1' : overrides.clerkUserId;

  const now = overrides?.now ?? (() => new Date('2026-02-01T00:00:00Z'));

  const authGateway = new FakeAuthGateway(user);

  const createCheckoutSessionUseCase = new FakeCreateCheckoutSessionUseCase(
    overrides?.checkoutOutput ?? { url: 'https://stripe/checkout' },
    overrides?.checkoutThrows,
  );

  const createPortalSessionUseCase = new FakeCreatePortalSessionUseCase(
    overrides?.portalOutput ?? { url: 'https://stripe/portal' },
    overrides?.portalThrows,
  );

  const rateLimiter: RateLimiter =
    overrides?.rateLimiter ?? new FakeRateLimiter();

  const clerkCalls: Array<undefined> = [];

  return {
    authGateway,
    logger: new FakeLogger(),
    createCheckoutSessionUseCase,
    createPortalSessionUseCase,
    idempotencyKeyRepository: new FakeIdempotencyKeyRepository(now),
    rateLimiter,
    getClerkUserId: async () => {
      clerkCalls.push(undefined);
      return clerkUserId;
    },
    appUrl,
    now,
    _calls: {
      clerkCalls,
    },
    _fixtures: {
      userId,
    },
  };
}

describe('billing-controller', () => {
  describe('createCheckoutSession', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await createCheckoutSession({ plan: 'weekly' }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { plan: expect.any(Array) },
        },
      });
      expect(deps.createCheckoutSessionUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await createCheckoutSession({ plan: 'monthly' }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.createCheckoutSessionUseCase.inputs).toEqual([]);
    });

    it('returns RATE_LIMITED when checkout is rate limited', async () => {
      const deps = createDeps({
        rateLimiter: new FakeRateLimiter({
          success: false,
          limit: 10,
          remaining: 0,
          retryAfterSeconds: 60,
        }),
      });

      const result = await createCheckoutSession({ plan: 'monthly' }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
      expect(deps.createCheckoutSessionUseCase.inputs).toEqual([]);
    });

    it('returns checkout URL when inputs are valid', async () => {
      const deps = createDeps({ appUrl: 'https://app.example.com' });

      const result = await createCheckoutSession({ plan: 'annual' }, deps);

      expect(result).toEqual({
        ok: true,
        data: { url: 'https://stripe/checkout' },
      });
      expect(deps.createCheckoutSessionUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          clerkUserId: 'clerk_1',
          email: 'user@example.com',
          plan: 'annual',
          successUrl:
            'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
          cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
        },
      ]);
      expect(deps._calls.clerkCalls).toHaveLength(1);
    });

    it('returns the cached checkout session when idempotencyKey is reused', async () => {
      const deps = createDeps();

      const input = {
        plan: 'monthly',
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      const first = await createCheckoutSession(input, deps);
      const second = await createCheckoutSession(input, deps);

      expect(first).toEqual({
        ok: true,
        data: { url: 'https://stripe/checkout' },
      });
      expect(second).toEqual(first);
      expect(deps.createCheckoutSessionUseCase.inputs).toHaveLength(1);
      expect(deps._calls.clerkCalls).toHaveLength(1);
    });

    it('does not cache RATE_LIMITED under the checkout idempotency key', async () => {
      const deps = createDeps({
        rateLimiter: new FakeRateLimiter([
          {
            success: false,
            limit: 10,
            remaining: 0,
            retryAfterSeconds: 60,
          },
          {
            success: true,
            limit: 10,
            remaining: 9,
            retryAfterSeconds: 0,
          },
        ]),
      });
      const input = {
        plan: 'monthly',
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      const first = await createCheckoutSession(input, deps);
      expect(first).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });

      const second = await createCheckoutSession(input, deps);
      expect(second).toEqual({
        ok: true,
        data: { url: 'https://stripe/checkout' },
      });
      expect(deps.createCheckoutSessionUseCase.inputs).toHaveLength(1);
    });

    it('replays a cached checkout session while the reused key is rate limited', async () => {
      const deps = createDeps({
        rateLimiter: new FakeRateLimiter([
          {
            success: true,
            limit: 10,
            remaining: 9,
            retryAfterSeconds: 0,
          },
          {
            success: false,
            limit: 10,
            remaining: 0,
            retryAfterSeconds: 60,
          },
        ]),
      });
      const input = {
        plan: 'monthly',
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      const first = await createCheckoutSession(input, deps);
      const second = await createCheckoutSession(input, deps);

      expect(first).toEqual({
        ok: true,
        data: { url: 'https://stripe/checkout' },
      });
      expect(second).toEqual(first);
      expect(deps.createCheckoutSessionUseCase.inputs).toHaveLength(1);
      expect(deps._calls.clerkCalls).toHaveLength(1);
      expect((deps.rateLimiter as FakeRateLimiter).inputs).toHaveLength(1);
    });

    it('returns the cached checkout session when same-form double submit races with the same idempotencyKey', async () => {
      const deps = createDeps();

      const input = {
        plan: 'monthly',
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      const [first, second] = await Promise.all([
        createCheckoutSession(input, deps),
        createCheckoutSession(input, deps),
      ]);

      expect(first).toEqual({
        ok: true,
        data: { url: 'https://stripe/checkout' },
      });
      expect(second).toEqual(first);
      expect(deps.createCheckoutSessionUseCase.inputs).toHaveLength(1);
      expect(deps.createCheckoutSessionUseCase.inputs[0]).toMatchObject({
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      });
    });

    it('returns ALREADY_SUBSCRIBED when use case throws ApplicationError', async () => {
      const deps = createDeps({
        checkoutThrows: new ApplicationError(
          'ALREADY_SUBSCRIBED',
          'Already subscribed',
        ),
      });

      const result = await createCheckoutSession({ plan: 'monthly' }, deps);

      expect(result).toEqual({
        ok: false,
        error: { code: 'ALREADY_SUBSCRIBED', message: 'Already subscribed' },
      });
    });

    it('keeps genuine checkout use-case ApplicationErrors cached when idempotencyKey is reused', async () => {
      const deps = createDeps({
        rateLimiter: new FakeRateLimiter([
          {
            success: true,
            limit: 10,
            remaining: 9,
            retryAfterSeconds: 0,
          },
          {
            success: false,
            limit: 10,
            remaining: 0,
            retryAfterSeconds: 60,
          },
        ]),
        checkoutThrows: new ApplicationError(
          'ALREADY_SUBSCRIBED',
          'Already subscribed',
        ),
      });
      const input = {
        plan: 'monthly',
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      const first = await createCheckoutSession(input, deps);
      const second = await createCheckoutSession(input, deps);

      expect(first).toEqual({
        ok: false,
        error: { code: 'ALREADY_SUBSCRIBED', message: 'Already subscribed' },
      });
      expect(second).toEqual(first);
      expect(deps.createCheckoutSessionUseCase.inputs).toHaveLength(1);
      expect((deps.rateLimiter as FakeRateLimiter).inputs).toHaveLength(1);
    });

    it('re-executes checkout after a transient INTERNAL_ERROR under the same key', async () => {
      const deps = createDeps({
        checkoutThrows: new ApplicationError(
          'INTERNAL_ERROR',
          'Stripe temporarily unavailable',
        ),
      });
      const input = {
        plan: 'monthly',
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      await createCheckoutSession(input, deps);
      await createCheckoutSession(input, deps);

      expect(deps.createCheckoutSessionUseCase.inputs).toHaveLength(2);
      expect((deps.rateLimiter as FakeRateLimiter).inputs).toHaveLength(2);
    });
  });

  describe('createPortalSession', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await createPortalSession(undefined, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(deps.createPortalSessionUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await createPortalSession({}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.createPortalSessionUseCase.inputs).toEqual([]);
    });

    it('returns RATE_LIMITED when portal session creation is rate limited', async () => {
      const deps = createDeps({
        rateLimiter: new FakeRateLimiter({
          success: false,
          limit: 20,
          remaining: 0,
          retryAfterSeconds: 60,
        }),
      });

      const result = await createPortalSession({}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
      expect(deps.createPortalSessionUseCase.inputs).toEqual([]);
    });

    it('returns portal URL when inputs are valid', async () => {
      const deps = createDeps({ appUrl: 'https://app.example.com' });

      const result = await createPortalSession({}, deps);

      expect(result).toEqual({
        ok: true,
        data: { url: 'https://stripe/portal' },
      });
      expect(deps.createPortalSessionUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          returnUrl: 'https://app.example.com/app/billing',
        },
      ]);
    });

    it('returns VALIDATION_ERROR when fresh portal session output is invalid', async () => {
      const deps = createDeps({
        portalOutput: { url: '' },
      });

      const result = await createPortalSession({}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { url: expect.any(Array) },
        },
      });
      expect(deps.createPortalSessionUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          returnUrl: 'https://app.example.com/app/billing',
        },
      ]);
    });

    it('returns the cached portal session when idempotencyKey is reused', async () => {
      const deps = createDeps();

      const input = {
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      const first = await createPortalSession(input, deps);
      const second = await createPortalSession(input, deps);

      expect(first).toEqual({
        ok: true,
        data: { url: 'https://stripe/portal' },
      });
      expect(second).toEqual(first);
      expect(deps.createPortalSessionUseCase.inputs).toHaveLength(1);
      expect(deps.createPortalSessionUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          returnUrl: 'https://app.example.com/app/billing',
          idempotencyKey: '11111111-1111-1111-1111-111111111111',
        },
      ]);
    });

    it('replays a cached portal session while the reused key is rate limited', async () => {
      const deps = createDeps({
        rateLimiter: new FakeRateLimiter([
          {
            success: true,
            limit: 20,
            remaining: 19,
            retryAfterSeconds: 0,
          },
          {
            success: false,
            limit: 20,
            remaining: 0,
            retryAfterSeconds: 60,
          },
        ]),
      });
      const input = {
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      const first = await createPortalSession(input, deps);
      const second = await createPortalSession(input, deps);

      expect(first).toEqual({
        ok: true,
        data: { url: 'https://stripe/portal' },
      });
      expect(second).toEqual(first);
      expect(deps.createPortalSessionUseCase.inputs).toHaveLength(1);
      expect((deps.rateLimiter as FakeRateLimiter).inputs).toHaveLength(1);
    });

    it('does not cache RATE_LIMITED under the idempotency key', async () => {
      const rateLimiter = new FakeRateLimiter([
        {
          success: false,
          limit: 20,
          remaining: 0,
          retryAfterSeconds: 60,
        },
        {
          success: true,
          limit: 20,
          remaining: 19,
          retryAfterSeconds: 0,
        },
      ]);
      const deps = createDeps({ rateLimiter });

      const input = {
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      const first = await createPortalSession(input, deps);
      expect(first).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });

      const second = await createPortalSession(input, deps);
      expect(second).toEqual({
        ok: true,
        data: { url: 'https://stripe/portal' },
      });
      expect(deps.createPortalSessionUseCase.inputs).toHaveLength(1);
    });

    it('returns NOT_FOUND when use case throws ApplicationError', async () => {
      const deps = createDeps({
        portalThrows: new ApplicationError(
          'NOT_FOUND',
          'Stripe customer not found',
        ),
      });

      const result = await createPortalSession({}, deps);

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Stripe customer not found' },
      });
    });

    it('keeps genuine portal use-case ApplicationErrors cached when idempotencyKey is reused', async () => {
      const deps = createDeps({
        rateLimiter: new FakeRateLimiter([
          {
            success: true,
            limit: 20,
            remaining: 19,
            retryAfterSeconds: 0,
          },
          {
            success: false,
            limit: 20,
            remaining: 0,
            retryAfterSeconds: 60,
          },
        ]),
        portalThrows: new ApplicationError(
          'NOT_FOUND',
          'Stripe customer not found',
        ),
      });
      const input = {
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      const first = await createPortalSession(input, deps);
      const second = await createPortalSession(input, deps);

      expect(first).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Stripe customer not found' },
      });
      expect(second).toEqual(first);
      expect(deps.createPortalSessionUseCase.inputs).toHaveLength(1);
      expect((deps.rateLimiter as FakeRateLimiter).inputs).toHaveLength(1);
    });

    it('re-executes portal creation after a transient STRIPE_ERROR under the same key', async () => {
      const deps = createDeps({
        portalThrows: new ApplicationError(
          'STRIPE_ERROR',
          'Stripe temporarily unavailable',
        ),
      });
      const input = {
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      await createPortalSession(input, deps);
      await createPortalSession(input, deps);

      expect(deps.createPortalSessionUseCase.inputs).toHaveLength(2);
      expect((deps.rateLimiter as FakeRateLimiter).inputs).toHaveLength(2);
    });
  });
});
