# BUG-275: Pricing "Subscribe" CTA Drops Return Destination and Plan Selection for Signed-Out Visitors

**Status:** Open
**Severity:** P3
**Date:** 2026-06-30
**Confirmed:** 2026-06-30
**Component:** Billing / Pricing / Auth Redirect

---

## Summary

The primary, always-visible conversion CTAs on `/pricing` ("Subscribe"/"Start free trial" for both monthly and annual plans) redirect an unauthenticated click to a bare `/sign-up` with no `redirect_url` and no plan context. After completing sign-up, Clerk's configured fallback sends the user to the dashboard, which immediately bounces them back to `/pricing?reason=subscription_required` because they still have no subscription — forcing them to reselect their plan and click Subscribe a second time. The generic checkout-error redirect path in the same file already preserves `?plan=...`, showing the team intended to carry this context but never wired it through the unauthenticated path specifically.

The "Manage Billing" action has the identical bare-redirect defect, but that button is **not** part of the always-visible anonymous funnel (see Reachability) — it only appears under a narrower, query-string-gated condition.

## Reachability

Reachable by every anonymous visitor who selects a plan and clicks "Start free trial"/"Subscribe" on the public, always-rendered `/pricing` page — this is the primary anonymous-conversion funnel, not an edge surface.

A second, narrower variant affects "Manage Billing": that button is not shown on a bare `/pricing` visit at all — [`app/pricing/page.tsx`](../../app/pricing/page.tsx)'s `buildPricingPresentation()` only sets `showManageBillingAction` when `reason` is `manage_billing` or `payment_processing`. So the "Manage Billing" bare-redirect is reachable only by an anonymous visitor arriving via a stale bookmark/shared link carrying that query string, or whose session expired after being routed there while briefly authenticated — not by every anonymous visitor.

## Reproduction

1. Visit `/pricing` while signed out.
2. Click "Start free trial" (or "Subscribe") under either the monthly or annual plan.
3. Complete Clerk sign-up.

Expected: land back on a flow that remembers the plan just chosen and proceeds toward checkout (or at minimum returns to `/pricing` with the plan pre-selected), in one pass.

Actual: `createCheckoutSession` throws `UNAUTHENTICATED` for the signed-out caller, and the action redirects to a bare `/sign-up` with no `redirect_url` and no plan parameter. Post-sign-up, Clerk's `signUpFallbackRedirectUrl` (since no `redirect_url` overrides it) sends the user to `/app/dashboard`; `enforceEntitledAppUser()` immediately redirects again to `/pricing?reason=subscription_required` because no subscription exists yet (confirmed via `CheckEntitlementUseCase`: a user with zero subscription rows resolves to exactly this reason). The user must reselect their plan and click Subscribe a second time — their original plan choice is not preserved anywhere across the round trip, and the round trip itself is a full extra page navigation through the dashboard, not merely "one extra click."

## Root Cause

- [`app/pricing/subscribe-action.ts`](../../app/pricing/subscribe-action.ts#L33-L34): on `result.error.code === 'UNAUTHENTICATED'`, the action calls `deps.redirectFn(ROUTES.SIGN_UP)` — a bare route, no query string.
- Contrast with the same file's generic-failure path, [`subscribe-action.ts#L55-L59`](../../app/pricing/subscribe-action.ts#L55-L59), which explicitly builds `?checkout=error&plan=${input.plan}` — proving the team already has the plan value in scope at the point of redirect and preserves it on one path but not the other.
- This exact bare-redirect behavior is pinned by an existing test: [`subscribe-actions.test.ts#L60-L79`](../../app/pricing/subscribe-actions.test.ts#L60-L79) (`'redirects to sign-up when checkout session returns UNAUTHENTICATED'`) asserts `message: 'redirect:/sign-up'` with nothing appended — any fix must update this test's expectation deliberately, not accidentally.
- The same bare-redirect pattern recurs for the sibling "Manage Billing" action, and is independently pinned in **four** places, all of which a fix must update: [`manage-billing-action.ts#L19`](../../app/pricing/manage-billing-action.ts#L19) (`unauthenticated: ROUTES.SIGN_UP`), [`manage-billing-actions.test.ts#L40`](../../app/pricing/manage-billing-actions.test.ts#L40) (`message: 'redirect:/sign-up'`), [`manage-billing-action.test.ts#L52`](../../app/pricing/manage-billing-action.test.ts#L52) (`url: '/sign-up'`), and [`manage-billing-core.test.ts#L88-L97`](../../lib/manage-billing/manage-billing-core.test.ts#L88-L97) (two assertions of `'/sign-up'`).
- The `redirect_url` mechanism itself is real and already relied upon elsewhere in this codebase: `proxy.ts`'s `auth.protect()` already redirects to `/sign-in?redirect_url=<returnBackUrl>` for protected-route deep links (regression-tested at [`proxy.test.ts#L315-L454`](../../proxy.test.ts#L315-L454)), and [`components/providers.tsx#L75`](../../components/providers.tsx#L75)'s `signUpFallbackRedirectUrl` is documented (in installed `@clerk/shared` type declarations) as a fallback used only "if there's no `redirect_url` in the path already" — confirming an explicit `redirect_url` on the initial `/sign-up` navigation would be honored, not overridden.
- [`app/(app)/app/layout.tsx`](<../../app/(app)/app/layout.tsx#L32-L51>) (`enforceEntitledAppUser`) is what then bounces the freshly-signed-up, still-unsubscribed user from the dashboard back to `/pricing?reason=subscription_required` — correct behavior given no subscription exists, but it's what turns the missing redirect context into a visible double round-trip for the user.

This is unrelated to, and does not regress, the already-verified-correct deep-link preservation mechanism for protected `/app/*` routes — that mechanism is sound; this gap is specific to the pricing page's own action-level redirect construction, which never participates in that mechanism at all.

## Impact

Every anonymous visitor who converts through the primary "Subscribe"/"Start free trial" CTA experiences an avoidable extra full page round-trip (through `/app/dashboard` and back) and loses their plan selection, landing back on `/pricing` to choose and click again. This is friction on the primary monetization path, not a correctness or security defect — fully recoverable, so it is P3 rather than higher.

## Proposed Fix

Carry the chosen plan (and a return-to-checkout intent) through the unauthenticated redirect, e.g. `deps.redirectFn(`${ROUTES.SIGN_UP}?redirect_url=${encodeURIComponent(`${ROUTES.PRICING}?plan=${input.plan}`)}`)`, and have `/pricing` accept a `?plan=` param on load. Apply the same fix to `manage-billing-action.ts`'s unauthenticated branch, updating all four pinned tests listed above deliberately.

**Scope note:** `PricingView` currently has **no plan-selection UI to read `?plan=` back into** — both plan cards ([`pricing-view.tsx`](../../app/pricing/pricing-view.tsx)) are always rendered independently as separate `<form>`s, with no toggle, radio group, or shared "selected plan" concept to highlight. This fix therefore requires adding a new visual affordance (e.g., emphasizing the previously-chosen card) from scratch, not wiring up an existing selector.

Rejected alternatives:
- **Rely solely on Clerk's `signUpFallbackRedirectUrl`.** This is correctly fallback-only and must stay that way (BUG-055 precedent, verified: the archived doc explicitly states fallback-not-force preserves return-URL flows); the fix belongs in supplying an explicit `redirect_url` from the pricing action, not in changing the fallback.
- **Auto-resubmit checkout after sign-up via client-side state (e.g. `localStorage`).** Adds cross-page client state and a new failure mode (stale/mismatched plan) for a problem a plain URL parameter already solves elsewhere in this same file.

## Failing Test Sketch

```ts
it('preserves the selected plan and a return destination when redirecting an unauthenticated subscribe attempt', async () => {
  const createCheckoutSessionFn = vi.fn(async () =>
    err('UNAUTHENTICATED', 'Not signed in'),
  );
  const redirectFn = createRedirectFn();

  await expect(
    subscribeMonthlyAction(new FormData(), { createCheckoutSessionFn, redirectFn }),
  ).rejects.toMatchObject({
    message: expect.stringContaining('plan=monthly'),
  });
});
```

Today this fails because the redirect target is the literal string `redirect:/sign-up` with no query string.

## Related

- BUG-055 (`docs/_archive/bugs/bug-055-post-login-redirects-to-landing-page.md`, already fixed) established the fallback-vs-explicit-redirect distinction this fix must respect — do not regress it.
- Distinct from, and does not affect, the already-verified-clean deep-link/`returnBackUrl` preservation for protected `/app/*` routes.
