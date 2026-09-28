// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';
import {
  createCheckoutSession,
  createPortalSession,
  createTrialPaymentMethodSetupSession,
} from './billing-controller';
import { createBillingControllerDeps } from './test-helpers/billing-controller-deps';

describe('billing-controller', () => {
  describe('createTrialPaymentMethodSetupSession', () => {
    it('passes only the authenticated user and server-owned return URLs', async () => {
      const deps = createBillingControllerDeps({
        appUrl: 'https://app.example.com',
      });

      const result = await createTrialPaymentMethodSetupSession({}, deps);

      expect(result).toEqual({
        ok: true,
        data: { url: 'https://stripe/setup' },
      });
      expect(deps.createTrialPaymentMethodSetupSessionUseCase.inputs).toEqual([
        {
          userId: deps._fixtures.userId,
          successUrl:
            'https://app.example.com/app/billing?trial_payment_method=success&session_id={CHECKOUT_SESSION_ID}',
          cancelUrl:
            'https://app.example.com/app/billing?trial_payment_method=cancel',
        },
      ]);
    });

    it('returns UNAUTHENTICATED without creating a setup session', async () => {
      const deps = createBillingControllerDeps({ user: null });

      const result = await createTrialPaymentMethodSetupSession({}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.createTrialPaymentMethodSetupSessionUseCase.inputs).toEqual(
        [],
      );
    });

    it('returns RATE_LIMITED without creating a setup session', async () => {
      const deps = createBillingControllerDeps({
        rateLimiter: new FakeRateLimiter({
          success: false,
          limit: 10,
          remaining: 0,
          retryAfterSeconds: 60,
        }),
      });

      const result = await createTrialPaymentMethodSetupSession({}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
      expect(deps.createTrialPaymentMethodSetupSessionUseCase.inputs).toEqual(
        [],
      );
    });

    it('replays the cached setup URL for a reused idempotency key', async () => {
      const deps = createBillingControllerDeps();
      const input = {
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      };

      const [first, second] = await Promise.all([
        createTrialPaymentMethodSetupSession(input, deps),
        createTrialPaymentMethodSetupSession(input, deps),
      ]);

      expect(first).toEqual({
        ok: true,
        data: { url: 'https://stripe/setup' },
      });
      expect(second).toEqual(first);
      expect(
        deps.createTrialPaymentMethodSetupSessionUseCase.inputs,
      ).toHaveLength(1);
    });
  });

  describe('createCheckoutSession', () => {
    const expectedOffer = {
      hasTrial: true,
      disclosureVersion: '2026-09-16',
    };

    it('returns VALIDATION_ERROR without creating Checkout when the displayed offer is omitted', async () => {
      const deps = createBillingControllerDeps();

      const result = await createCheckoutSession({ plan: 'monthly' }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { expectedOffer: expect.any(Array) },
        },
      });
      expect(deps.createCheckoutSessionUseCase.inputs).toEqual([]);
      expect(deps._calls.clerkCalls).toEqual([]);
    });

    // DEBT-414 F03: a separate, affirmative renewal opt-in is required.
    it.each([
      ['omitted', {}],
      ['not affirmative', { renewalOptIn: false }],
    ])(
      'returns VALIDATION_ERROR without creating Checkout when the renewal opt-in is %s',
      async (_case, optIn) => {
        const deps = createBillingControllerDeps();

        const result = await createCheckoutSession(
          { plan: 'monthly', expectedOffer, ...optIn },
          deps,
        );

        expect(result).toMatchObject({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            fieldErrors: { renewalOptIn: expect.any(Array) },
          },
        });
        expect(deps.createCheckoutSessionUseCase.inputs).toEqual([]);
      },
    );

    it('accepts a same-day revision of a disclosure version', async () => {
      const deps = createBillingControllerDeps();

      const result = await createCheckoutSession(
        {
          plan: 'monthly',
          expectedOffer: { hasTrial: true, disclosureVersion: '2026-09-28.2' },
          renewalOptIn: true,
        },
        deps,
      );

      expect(result).toMatchObject({ ok: true });
      expect(deps.createCheckoutSessionUseCase.inputs).toMatchObject([
        {
          expectedOffer: { hasTrial: true, disclosureVersion: '2026-09-28.2' },
        },
      ]);
    });

    it('returns VALIDATION_ERROR for a malformed disclosure version', async () => {
      const deps = createBillingControllerDeps();

      const result = await createCheckoutSession(
        {
          plan: 'monthly',
          expectedOffer: { hasTrial: true, disclosureVersion: '2026-09-28.x' },
          renewalOptIn: true,
        },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(deps.createCheckoutSessionUseCase.inputs).toEqual([]);
    });

    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createBillingControllerDeps();

      const result = await createCheckoutSession(
        { plan: 'weekly', expectedOffer, renewalOptIn: true },
        deps,
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
      const deps = createBillingControllerDeps({ user: null });

      const result = await createCheckoutSession(
        { plan: 'monthly', expectedOffer, renewalOptIn: true },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.createCheckoutSessionUseCase.inputs).toEqual([]);
    });

    it('returns RATE_LIMITED when checkout is rate limited', async () => {
      const deps = createBillingControllerDeps({
        rateLimiter: new FakeRateLimiter({
          success: false,
          limit: 10,
          remaining: 0,
          retryAfterSeconds: 60,
        }),
      });

      const result = await createCheckoutSession(
        { plan: 'monthly', expectedOffer, renewalOptIn: true },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
      expect(deps.createCheckoutSessionUseCase.inputs).toEqual([]);
    });

    it('returns checkout URL when inputs are valid', async () => {
      const deps = createBillingControllerDeps({
        appUrl: 'https://app.example.com',
      });

      const result = await createCheckoutSession(
        { plan: 'annual', expectedOffer, renewalOptIn: true },
        deps,
      );

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
          expectedOffer,
          successUrl:
            'https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}',
          cancelUrl: 'https://app.example.com/pricing?checkout=cancel',
        },
      ]);
      expect(deps._calls.clerkCalls).toHaveLength(1);
    });

    it('returns the cached checkout session when idempotencyKey is reused', async () => {
      const deps = createBillingControllerDeps();

      const input = {
        plan: 'monthly',
        expectedOffer,
        renewalOptIn: true,
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

    it('scopes replay and provider keys to the plan and displayed offer', async () => {
      const deps = createBillingControllerDeps();
      const idempotencyKey = '11111111-1111-1111-1111-111111111111';
      const offers = [
        {
          plan: 'monthly',
          expectedOffer: { hasTrial: true, disclosureVersion: '2026-09-16' },
          renewalOptIn: true,
        },
        {
          plan: 'annual',
          expectedOffer: { hasTrial: true, disclosureVersion: '2026-09-16' },
          renewalOptIn: true,
        },
        {
          plan: 'annual',
          expectedOffer: { hasTrial: false, disclosureVersion: '2026-09-16' },
          renewalOptIn: true,
        },
        {
          plan: 'annual',
          expectedOffer: { hasTrial: false, disclosureVersion: '2026-09-17' },
          renewalOptIn: true,
        },
      ];
      for (const offer of offers) {
        expect(
          await createCheckoutSession({ ...offer, idempotencyKey }, deps),
        ).toMatchObject({ ok: true });
      }
      expect(
        await createCheckoutSession({ ...offers[0], idempotencyKey }, deps),
      ).toMatchObject({ ok: true });
      expect(deps.createCheckoutSessionUseCase.inputs).toHaveLength(4);
      expect(
        new Set(
          deps.createCheckoutSessionUseCase.inputs.map(
            (input) => input.idempotencyKey,
          ),
        ).size,
      ).toBe(4);
      expect(
        deps.createCheckoutSessionUseCase.inputs[0]?.expectedOffer,
      ).toEqual(offers[0]?.expectedOffer);
    });

    it('does not cache RATE_LIMITED under the checkout idempotency key', async () => {
      const deps = createBillingControllerDeps({
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
        expectedOffer,
        renewalOptIn: true,
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
      const deps = createBillingControllerDeps({
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
        expectedOffer,
        renewalOptIn: true,
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
      const deps = createBillingControllerDeps();

      const input = {
        plan: 'monthly',
        expectedOffer,
        renewalOptIn: true,
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
        idempotencyKey:
          '11111111-1111-1111-1111-111111111111:monthly:trial:2026-09-16',
      });
    });

    it('returns ALREADY_SUBSCRIBED when use case throws ApplicationError', async () => {
      const deps = createBillingControllerDeps({
        checkoutThrows: new ApplicationError(
          'ALREADY_SUBSCRIBED',
          'Already subscribed',
        ),
      });

      const result = await createCheckoutSession(
        { plan: 'monthly', expectedOffer, renewalOptIn: true },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: 'ALREADY_SUBSCRIBED', message: 'Already subscribed' },
      });
    });

    it('re-executes a reused key after ALREADY_SUBSCRIBED instead of caching it', async () => {
      // ALREADY_SUBSCRIBED depends on currentPeriodEnd > now, which can lapse
      // within the cache TTL while the billing surface's mount-fixed key
      // never rotates — so the claim aborts and every retry re-evaluates.
      const deps = createBillingControllerDeps({
        checkoutThrows: new ApplicationError(
          'ALREADY_SUBSCRIBED',
          'Already subscribed',
        ),
      });
      const input = {
        plan: 'monthly',
        expectedOffer,
        renewalOptIn: true,
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      const first = await createCheckoutSession(input, deps);
      const second = await createCheckoutSession(input, deps);

      expect(first).toEqual({
        ok: false,
        error: { code: 'ALREADY_SUBSCRIBED', message: 'Already subscribed' },
      });
      expect(second).toEqual(first);
      expect(deps.createCheckoutSessionUseCase.inputs).toHaveLength(2);
    });

    it('re-executes checkout after a transient INTERNAL_ERROR under the same key', async () => {
      const deps = createBillingControllerDeps({
        checkoutThrows: new ApplicationError(
          'INTERNAL_ERROR',
          'Stripe temporarily unavailable',
        ),
      });
      const input = {
        plan: 'monthly',
        expectedOffer,
        renewalOptIn: true,
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
      const deps = createBillingControllerDeps();

      const result = await createPortalSession(undefined, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(deps.createPortalSessionUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createBillingControllerDeps({ user: null });

      const result = await createPortalSession({}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.createPortalSessionUseCase.inputs).toEqual([]);
    });

    it('returns RATE_LIMITED when portal session creation is rate limited', async () => {
      const deps = createBillingControllerDeps({
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
      const deps = createBillingControllerDeps({
        appUrl: 'https://app.example.com',
      });

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
      const deps = createBillingControllerDeps({
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

    it('replays identical field errors when keyed portal output is invalid', async () => {
      const rateLimiter = new FakeRateLimiter();
      const deps = createBillingControllerDeps({
        portalOutput: { url: '' },
        rateLimiter,
      });
      const input = {
        idempotencyKey: '11111111-1111-1111-1111-111111111111',
      } as const;

      const first = await createPortalSession(input, deps);
      const second = await createPortalSession(input, deps);

      expect(first).toEqual({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          fieldErrors: {
            url: ['Too small: expected string to have >=1 characters'],
          },
        },
      });
      expect(second).toEqual(first);
      expect(deps.createPortalSessionUseCase.inputs).toHaveLength(1);
      expect(rateLimiter.inputs).toHaveLength(1);
    });

    it('returns the cached portal session when idempotencyKey is reused', async () => {
      const deps = createBillingControllerDeps();

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
      const deps = createBillingControllerDeps({
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
      const deps = createBillingControllerDeps({ rateLimiter });

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
      const deps = createBillingControllerDeps({
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

    it('re-executes a reused key after a missing-customer NOT_FOUND instead of caching it', async () => {
      // A Stripe customer can be created by a later checkout while the
      // billing page's mount-fixed key is still live; the retry must
      // re-evaluate rather than replay a stale not-found for the TTL.
      const deps = createBillingControllerDeps({
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
      expect(deps.createPortalSessionUseCase.inputs).toHaveLength(2);
    });

    it('re-executes portal creation after a transient STRIPE_ERROR under the same key', async () => {
      const deps = createBillingControllerDeps({
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
