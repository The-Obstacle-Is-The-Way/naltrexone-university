# DEBT-093: Clerk Webhook Route Contains Business Logic (Framework Layer Leakage)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-04
**Resolved:** 2026-02-04

---

## Description

The framework route file `app/api/webhooks/clerk/route.ts` defined and owned non-trivial Stripe cancellation logic (`cancelStripeCustomerSubscriptions`) including nested retries and subscription iteration.

Evidence:

- `app/api/webhooks/clerk/route.ts` previously defined `cancelStripeCustomerSubscriptions(...)` with:
  - `stripe.subscriptions.list(...)` iteration
  - per-subscription cancellation with idempotency keys
  - retry/backoff policy via `retry(...)`

This is adapter/use-case behavior living in the outermost framework layer.

## Impact

- **Architecture drift:** framework code owns business logic instead of calling adapters/use cases.
- **Reduced reuse:** the cancellation behavior can’t be reused by other adapters/controllers without importing framework code.
- **Testing friction:** route tests must cover business logic that should be unit-testable outside Next.js routing.

## Resolution

1. Extracted Stripe cancellation into `src/adapters/gateways/stripe-subscription-canceler.ts`.
2. Added unit coverage in `src/adapters/gateways/stripe-subscription-canceler.test.ts`.
3. Updated `app/api/webhooks/clerk/route.ts` to be wiring-only by importing and passing the canceler into `createWebhookHandler(...)`.

## Verification

- `app/api/webhooks/clerk/route.ts` contains only routing/wiring code (no Stripe loops).
- Cancellation behavior is unit-tested outside Next.js.
- Existing route tests remain green.

## Related

- `app/api/webhooks/clerk/route.ts`
- `src/adapters/controllers/clerk-webhook-controller.ts`
- `lib/container.ts` (composition root)
