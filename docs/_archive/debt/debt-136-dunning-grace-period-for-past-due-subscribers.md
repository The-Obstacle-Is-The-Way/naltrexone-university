# DEBT-136: Dunning Grace Period for Past-Due Subscribers

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07
**Reclassified From:** BUG-076
**Spec Mandate:** master_spec Section 4.2.1

---

## Description

`pastDue` subscribers were immediately locked out of content. The SSOT has been amended (master_spec Section 4.2) to include `pastDue` as an entitled status. Stripe manages the dunning lifecycle — when retries are exhausted, it transitions the subscription to `canceled` or `unpaid`, at which point the existing entitlement logic locks the user out. No application-level grace window is needed.

## Policy Decision (2026-02-07)

**Unconditional access for `pastDue` while Stripe retries payment.** Rationale:

1. Stripe IS the dunning engine — don't build a second one
2. `currentPeriodEnd > now` means the user paid for the current period; the failure is for the *next* period
3. A configurable grace window adds state (`pastDueSince`) and complexity for zero benefit over Stripe's built-in retry schedule
4. Immediate lockout causes unnecessary support burden and involuntary churn
5. This is industry standard (Netflix, Spotify, every well-run SaaS)

## Implementation Required

1. Add `'pastDue'` to `EntitledStatuses` array in `src/domain/value-objects/subscription-status.ts`
2. Update `isEntitledStatus` tests to expect `true` for `pastDue`
3. Add `isEntitled` test case for `pastDue` with future period end
4. Update `CheckEntitlementUseCase` — `pastDue` now returns `isEntitled: true`
5. Add non-blocking "payment failed" banner in `app/(app)/app/layout.tsx` when `subscriptionStatus === 'pastDue'`
6. Update pricing page — `pastDue` users should not see checkout CTAs (they need billing portal)

## Verification

- [x] SSOT updated with explicit dunning grace policy (master_spec 4.2.1)
- [x] `EntitledStatuses` includes `pastDue`
- [x] Domain and use case tests updated
- [x] App layout shows payment-failed banner for `pastDue` users
- [x] Pricing page handles `pastDue` state correctly (shows "already subscribed" + billing link)
- [x] Checkout success page redirects `pastDue` to dashboard (dunning grace)
- [x] `pnpm typecheck && pnpm lint && pnpm test --run` pass

## Related

- `docs/specs/master_spec.md` (Section 4.2, 4.2.1 Entitlement + Dunning)
- `src/domain/value-objects/subscription-status.ts`
- `src/domain/services/entitlement.ts`
- `src/application/use-cases/check-entitlement.ts`
- `app/(app)/app/layout.tsx`
- `app/pricing/page.tsx`
- Former BUG-076 (deleted — fully superseded by this document)
