# DEBT-412: Checkout Success Trial Copy Is Redirect-Fallback Only

**Priority:** P3 (trial UX polish; not blocking access or billing correctness)
**Created:** 2026-06-09
**Audit verified:** 2026-06-09 (post-PR-3 merge debt-register audit)
**Status:** Active — filed by DEBT-410 PR-3 (`3ba5576a`); pending owner product decision.
**Owner:** Trial UX / billing flow.
**Related:** [DEBT-410](./debt-410-free-trial-pathway-and-pricing-access-copy.md), [Debt Index](./index.md)

---

## Problem

DEBT-410 PR-3 adds trial-aware checkout-success copy, but the current checkout-success page normally redirects before that copy can render.

Evidence:

- `runCheckoutSuccessPage()` awaits `syncCheckoutSuccess()` before returning page markup (`app/(marketing)/checkout/success/page.tsx:37-55`).
- `syncCheckoutSuccess()` defaults `redirectFn` to Next's `redirect` (`app/(marketing)/checkout/success/checkout-success-sync.tsx:86-90`), then calls it for both non-entitled and entitled outcomes (`app/(marketing)/checkout/success/checkout-success-sync.tsx:254-265`).
- The result type explicitly documents that the post-redirect render is normally unreachable (`app/(marketing)/checkout/success/checkout-success-types.ts:74-80`).

So the new copy is correct for intercepted-redirect tests and fallback rendering, but it is not a reliably user-visible confirmation after a real Stripe Checkout return.

## User Impact

A no-card trial can still start correctly, sync entitlement, and redirect to the app. The missing piece is trust/confirmation copy at the exact moment the user returns from Checkout. The app-shell countdown later confirms the trial state, but the checkout-success page itself does not normally reassure the user that no charge happened.

## Decision Needed

Choose one explicit product path:

1. **Keep immediate server redirect and accept checkout-success copy as fallback-only.** DEBT-410 now treats the checkout-success copy as fallback/intercepted-render copy, with the app-shell countdown as the reliable user-facing trial confirmation.
2. **Make checkout success a real interstitial.** Sync server-side, render trial/paid confirmation copy, and perform a controlled client-side redirect to the dashboard after a short delay.

No implementation should happen until this decision is made, because changing checkout-success redirect semantics affects the established billing handoff.

## Constraints

- Do not weaken the eager sync guarantee; entitlement must be persisted before the user reaches `/app/*`.
- Do not introduce a client-only Stripe sync path.
- Preserve invalid/tampered-session redirects to `/pricing?checkout=error`.
- If adding a client redirect, use a tiny client component with accessible copy and no test-library React dependency; static render tests cover markup, browser/E2E covers timed navigation if needed.

## Rejected Alternatives

- **Pretend the current PR-3 copy is fully user-facing.** Rejected: current code and type comments prove it is normally post-redirect fallback.
- **Remove the copy.** Rejected: it is still useful for intercepted/fallback rendering and keeps the status-derived copy path covered.
- **Retrofit redirect behavior into the already-merged DEBT-410 PR-3.** Rejected: not trivial or risk-free; it changes a billing return-flow contract beyond the PR-3 consistency fixes.

## Acceptance Criteria

- Product explicitly chooses fallback-only or real interstitial.
- If fallback-only, DEBT-410 wording remains explicit that checkout-success copy is fallback-only and tests continue to pin fallback behavior.
- If interstitial, the user sees "Your 7-day free trial has started — no charge today" after no-card trial checkout before dashboard navigation.
- Eager sync still runs before dashboard access.
- Full gate and billing E2E pass.
