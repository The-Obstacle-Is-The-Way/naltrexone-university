# DEBT-071: Missing WHY Comments on Non-Obvious Business Logic

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary

Several locations contained intentional behavior that was not obvious without context (Stripe event quirks, graceful degradation on orphaned references, deterministic shuffles). Adding short WHY comments improves maintainability without changing behavior.

## Fix

Added concise WHY comments to the following areas:

- `src/adapters/gateways/stripe-payment-gateway.ts` — why `customer.subscription.created` without `metadata.user_id` is skipped
- `app/(marketing)/checkout/success/page.tsx` — why each validation exists before redirecting
- `lib/env.ts` — why dummy Clerk keys exist when `NEXT_PUBLIC_SKIP_CLERK=true`
- `src/adapters/controllers/bookmark-controller.ts` — why missing questions are skipped in bookmark lists
- `src/adapters/controllers/review-controller.ts` — why missing questions are skipped in missed-question lists
- `src/adapters/controllers/stats-controller.ts` — why missing questions are skipped in recent activity
- `src/application/use-cases/get-next-question.ts` — why choices are deterministically shuffled

## Verification

- [x] No behavior changes; comments only

