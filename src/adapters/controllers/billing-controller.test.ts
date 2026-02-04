import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { RateLimiter } from '@/src/application/ports/gateways';
import {
  FakeAuthGateway,
  FakeIdempotencyKeyRepository,
} from '@/src/application/test-helpers/fakes';
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionOutput,
  CreatePortalSessionInput,
  CreatePortalSessionOutput,
} from '@/src/application/use-cases';
import type { User } from '@/src/domain/entities';
import { createUser } from '@/src/domain/test-helpers';
import {
  createCheckoutSession,
  createPortalSession,
} from './billing-controller';

class FakeCreateCheckoutSessionUseCase {
  readonly inputs: CreateCheckoutSessionInput[] = [];

  constructor(
    private readonly output: CreateCheckoutSessionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: CreateCheckoutSessionInput,
  ): Promise<CreateCheckoutSessionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

class FakeCreatePortalSessionUseCase {
  readonly inputs: CreatePortalSessionInput[] = [];

  constructor(
    private readonly output: CreatePortalSessionOutput,
    private readonly toThrow?: unknown,
  ) {}

  async execute(
    input: CreatePortalSessionInput,
  ): Promise<CreatePortalSessionOutput> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

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
    overrides?.rateLimiter ??
    ({
      limit: async () => ({
        success: true,
        limit: 10,
        remaining: 9,
        retryAfterSeconds: 0,
      }),
    } satisfies RateLimiter);

  const clerkCalls: Array<undefined> = [];

  return {
    authGateway,
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
      expect(deps.createCheckoutSessionUseCase.inputs).toEqual([]);
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
      expect(deps.createCheckoutSessionUseCase.inputs).toEqual([]);
    });

    it('returns RATE_LIMITED when checkout is rate limited', async () => {
      const deps = createDeps({
        rateLimiter: {
          limit: async () => ({
            success: false,
            limit: 10,
            remaining: 0,
            retryAfterSeconds: 60,
          }),
        },
      });

      const result = await createCheckoutSession(
        { plan: 'monthly' },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
      expect(deps.createCheckoutSessionUseCase.inputs).toEqual([]);
    });

    it('passes URLs and user identity to the use case', async () => {
      const deps = createDeps({ appUrl: 'https://app.example.com' });

      const result = await createCheckoutSession(
        { plan: 'annual' },
        deps as never,
      );

      expect(result).toEqual({
        ok: true,
        data: { url: 'https://stripe/checkout' },
      });
      expect(deps.createCheckoutSessionUseCase.inputs).toEqual([
        {
          userId: 'user_1',
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

      const first = await createCheckoutSession(input, deps as never);
      const second = await createCheckoutSession(input, deps as never);

      expect(first).toEqual({
        ok: true,
        data: { url: 'https://stripe/checkout' },
      });
      expect(second).toEqual(first);
      expect(deps.createCheckoutSessionUseCase.inputs).toHaveLength(1);
      expect(deps._calls.clerkCalls).toHaveLength(1);
    });

    it('maps ApplicationError from use case via handleError', async () => {
      const deps = createDeps({
        checkoutThrows: new ApplicationError(
          'ALREADY_SUBSCRIBED',
          'Already subscribed',
        ),
      });

      const result = await createCheckoutSession(
        { plan: 'monthly' },
        deps as never,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'ALREADY_SUBSCRIBED', message: 'Already subscribed' },
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
      expect(deps.createPortalSessionUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await createPortalSession({}, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.createPortalSessionUseCase.inputs).toEqual([]);
    });

    it('passes returnUrl to the use case', async () => {
      const deps = createDeps({ appUrl: 'https://app.example.com' });

      const result = await createPortalSession({}, deps as never);

      expect(result).toEqual({
        ok: true,
        data: { url: 'https://stripe/portal' },
      });
      expect(deps.createPortalSessionUseCase.inputs).toEqual([
        { userId: 'user_1', returnUrl: 'https://app.example.com/app/billing' },
      ]);
    });

    it('maps ApplicationError from use case via handleError', async () => {
      const deps = createDeps({
        portalThrows: new ApplicationError(
          'NOT_FOUND',
          'Stripe customer not found',
        ),
      });

      const result = await createPortalSession({}, deps as never);

      expect(result).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Stripe customer not found' },
      });
    });
  });
});
