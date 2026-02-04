# DEBT-093: Clerk Webhook Route Contains Business Logic (Framework Layer Leakage)

**Status:** Open
**Priority:** P2
**Date:** 2026-02-04

---

## Description

The framework route file `app/api/webhooks/clerk/route.ts` defines and owns non-trivial Stripe cancellation logic (`cancelStripeCustomerSubscriptions`) including nested retries and subscription iteration.

Evidence:

- `app/api/webhooks/clerk/route.ts:19-48` defines `cancelStripeCustomerSubscriptions(...)` with:
  - `stripe.subscriptions.list(...)` iteration
  - per-subscription cancellation with idempotency keys
  - retry/backoff policy via `retry(...)`

This is adapter/use-case behavior living in the outermost framework layer.

## Impact

- **Architecture drift:** framework code owns business logic instead of calling adapters/use cases.
- **Reduced reuse:** the cancellation behavior can’t be reused by other adapters/controllers without importing framework code.
- **Testing friction:** route tests must cover business logic that should be unit-testable outside Next.js routing.

## Resolution

### Option A: Move cancellation into adapters (Recommended)

1. Move `cancelStripeCustomerSubscriptions` into an adapters module, e.g.:
   - `src/adapters/gateways/stripe-subscription-canceler.ts`, or
   - add `cancelCustomerSubscriptions(...)` to `StripePaymentGateway`.
2. Inject it via the container (composition root).
3. Keep `route.ts` as wiring only:
   - verify webhook
   - call controller/use case
   - return response

### Option B: Promote to application use case

If cancellation semantics become business rules (e.g., which statuses to cancel), move orchestration into a use case and keep Stripe calls behind a port.

## Verification

- `app/api/webhooks/clerk/route.ts` contains only routing/wiring code (no Stripe loops).
- Cancellation behavior is unit-tested outside Next.js.
- Existing route tests remain green.

## Related

- `app/api/webhooks/clerk/route.ts`
- `src/adapters/controllers/clerk-webhook-controller.ts`
- `lib/container.ts` (composition root)

