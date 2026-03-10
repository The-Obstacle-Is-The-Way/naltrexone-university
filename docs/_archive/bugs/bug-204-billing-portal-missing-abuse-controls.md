# BUG-204: Billing Portal Session Creation Lacks Abuse Controls

**Status:** Open
**Priority:** P3
**Date:** 2026-03-10
**Component:** Billing / Server Actions / Stripe

---

## Description

`createPortalSession` is exposed through two authenticated server actions, but the controller applies neither per-user rate limiting nor application-level idempotency. The application port supports an optional `idempotencyKey`, and the Stripe gateway honors it, but the controller schema is `z.object({}).strict()`, so callers cannot supply one. Every replay creates a new Stripe billing portal session.

Observed behavior:
- Both pricing and app billing entry points call the same controller with empty input.
- Any authenticated user who has a `stripe_customers` row can repeatedly hit Stripe's `billingPortal.sessions.create`.

Expected behavior:
- Portal-session creation should have abuse controls comparable to other Stripe-mutating actions: per-user throttling and a replay-safe path for duplicate submissions.

## Impact

- An authenticated user can script unlimited portal-session creation against the platform's Stripe account.
- This creates operational noise and can consume upstream Stripe rate-limit budget shared with legitimate billing flows.
- This is not a cross-account data-isolation bug, but it is a real authenticated abuse path.

## Steps to Reproduce

1. Sign in as a user with an existing `stripe_customers` mapping.
2. Trigger "Manage Billing" from `/pricing` or `/app/billing` and capture the server-action request.
3. Replay the same request in a loop.
4. Observe that each accepted request creates a fresh Stripe billing portal session instead of being rate-limited or replayed from cache.

## Root Cause

Tracer-bullet path:
1. Both server-action entry points call the same portal creator at [app/pricing/manage-billing-actions.ts#L32](/Users/ray/Desktop/github/naltrexone-university/app/pricing/manage-billing-actions.ts#L32) and [app/(app)/app/billing/manage-billing-actions.ts#L32](/Users/ray/Desktop/github/naltrexone-university/app/(app)/app/billing/manage-billing-actions.ts#L32).
2. The controller only accepts an empty object at [src/adapters/controllers/billing-controller.ts#L33](/Users/ray/Desktop/github/naltrexone-university/src/adapters/controllers/billing-controller.ts#L33).
3. Unlike checkout, the portal path at [src/adapters/controllers/billing-controller.ts#L145](/Users/ray/Desktop/github/naltrexone-university/src/adapters/controllers/billing-controller.ts#L145) has no `rateLimiter.limit(...)` call and no `withIdempotency(...)` wrapper.
4. The application port already supports `idempotencyKey?: string` at [src/application/ports/billing.ts#L4](/Users/ray/Desktop/github/naltrexone-university/src/application/ports/billing.ts#L4).
5. The use case would forward an idempotency key if present at [src/application/use-cases/create-portal-session.ts#L32](/Users/ray/Desktop/github/naltrexone-university/src/application/use-cases/create-portal-session.ts#L32), but the current controller makes that impossible.
6. The Stripe gateway always executes `billingPortal.sessions.create(...)` at [src/adapters/gateways/stripe/stripe-portal.ts#L32](/Users/ray/Desktop/github/naltrexone-university/src/adapters/gateways/stripe/stripe-portal.ts#L32).
7. For comparison, checkout has both rate limiting and idempotency at [src/adapters/controllers/billing-controller.ts#L97](/Users/ray/Desktop/github/naltrexone-university/src/adapters/controllers/billing-controller.ts#L97) and [src/adapters/controllers/billing-controller.ts#L129](/Users/ray/Desktop/github/naltrexone-university/src/adapters/controllers/billing-controller.ts#L129).

## Recommended Fix

- Add a per-user rate limit for portal-session creation, for example `billing:createPortalSession:${userId}`.
- Extend `CreatePortalSessionInputSchema` to accept an optional UUID `idempotencyKey`.
- Wrap the portal flow in `withIdempotency(...)` so duplicate submissions replay the cached URL instead of creating additional Stripe sessions.
- Add regression tests for both the rate-limited path and idempotent replay path.

## Verification

- [x] Code-level tracer-bullet verified on 2026-03-10.
- [x] Existing controller tests confirm the current behavior but do not cover abuse controls: [src/adapters/controllers/billing-controller.test.ts#L204](/Users/ray/Desktop/github/naltrexone-university/src/adapters/controllers/billing-controller.test.ts#L204).
- [x] Targeted verification run passed: `pnpm test --run lib/env.test.ts app/api/webhooks/clerk/route.test.ts src/adapters/controllers/billing-controller.test.ts`.
- [ ] Manual replay harness executed against a live environment.

## Related

- The rate-limiting policy is documented generally in [docs/adr/adr-016-rate-limiting.md](/Users/ray/Desktop/github/naltrexone-university/docs/adr/adr-016-rate-limiting.md).
- The portal server action contract lives at [docs/specs/master_spec.md#L911](/Users/ray/Desktop/github/naltrexone-university/docs/specs/master_spec.md#L911).
