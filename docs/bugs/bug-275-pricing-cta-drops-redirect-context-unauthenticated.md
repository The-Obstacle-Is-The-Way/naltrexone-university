# BUG-275: Pricing "Subscribe" CTA Drops Return Destination and Plan Selection for Signed-Out Visitors

**Status:** Open
**Severity:** P3
**Date:** 2026-06-30
**Confirmed:** 2026-06-30
**Component:** Billing / Pricing / Auth Redirect

---

## Summary

Before the fix on this branch, the primary, always-visible conversion CTAs on `/pricing` ("Subscribe"/"Start free trial" for both monthly and annual plans) redirected an unauthenticated click to a bare `/sign-up` with no `redirect_url` and no plan context. After completing sign-up, Clerk's configured fallback sent the user to the dashboard, which immediately bounced them back to `/pricing?reason=subscription_required` because they still had no subscription — forcing them to reselect their plan and click Subscribe a second time. The generic checkout-error redirect path in the same file already preserved `?plan=...`, showing the team intended to carry this context but never wired it through the unauthenticated path specifically.

The "Manage Billing" action has the identical bare-redirect defect, but that button is **not** part of the always-visible anonymous funnel (see Reachability) — it only appears under a narrower, query-string-gated condition.

## Reachability

Reachable by every anonymous visitor who selects a plan and clicks "Start free trial"/"Subscribe" on the public, always-rendered `/pricing` page — this is the primary anonymous-conversion funnel, not an edge surface.

A second, narrower variant affects "Manage Billing": that button is not shown on a bare `/pricing` visit at all — [`app/pricing/page.tsx`](../../app/pricing/page.tsx)'s `buildPricingPresentation()` only sets `showManageBillingAction` when `reason` is `manage_billing` or `payment_processing`. So the "Manage Billing" bare-redirect is reachable only by an anonymous visitor arriving via a stale bookmark/shared link carrying that query string, or whose session expired after being routed there while briefly authenticated — not by every anonymous visitor.

## Reproduction

1. Visit `/pricing` while signed out.
2. Click "Start free trial" (or "Subscribe") under either the monthly or annual plan.
3. Complete Clerk sign-up.

Expected: land back on a flow that remembers the plan just chosen and proceeds toward checkout (or at minimum returns to `/pricing` with the plan intact), in one pass.

Pre-fix actual: `createCheckoutSession` threw `UNAUTHENTICATED` for the signed-out caller, and the action redirected to a bare `/sign-up` with no `redirect_url` and no plan parameter. Post-sign-up, Clerk's `signUpFallbackRedirectUrl` (since no `redirect_url` overrode it) sent the user to `/app/dashboard`; `enforceEntitledAppUser()` immediately redirected again to `/pricing?reason=subscription_required` because no subscription existed yet (confirmed via `CheckEntitlementUseCase`: a user with zero subscription rows resolves to exactly this reason). The user had to reselect their plan and click Subscribe a second time — their original plan choice was not preserved anywhere across the round trip, and the round trip itself was a full extra page navigation through the dashboard, not merely "one extra click."

## Root Cause

- Pre-fix, [`app/pricing/subscribe-action.ts`](../../app/pricing/subscribe-action.ts) called `deps.redirectFn(ROUTES.SIGN_UP)` on `result.error.code === 'UNAUTHENTICATED'` — a bare route, no query string. This branch hardens that fallback at [`subscribe-action.ts#L33-L36`](../../app/pricing/subscribe-action.ts#L33-L36) with `toSignUpRedirectRoute(toPricingRoute({ plan: input.plan }))`.
- The same file's generic-failure path already preserved `?plan=...`; this branch also routes that path through the same shared helper at [`subscribe-action.ts#L57-L59`](../../app/pricing/subscribe-action.ts#L57-L59), so pricing query names are no longer duplicated there.
- The old bare-redirect behavior was pinned by an existing test in `subscribe-actions.test.ts`; this branch updates it to assert the explicit Clerk `redirect_url` and selected plan at [`subscribe-actions.test.ts#L66-L95`](../../app/pricing/subscribe-actions.test.ts#L66-L95).
- The same bare-redirect pattern recurred for the sibling "Manage Billing" action. This branch updates [`app/pricing/manage-billing-action.ts#L17-L22`](../../app/pricing/manage-billing-action.ts#L17-L22), [`manage-billing-actions.test.ts#L29-L45`](../../app/pricing/manage-billing-actions.test.ts#L29-L45), and [`manage-billing-action.test.ts#L35-L54`](../../app/pricing/manage-billing-action.test.ts#L35-L54). The shared `lib/manage-billing/manage-billing-core.ts` remains route-agnostic by design; it still forwards whichever route-specific unauthenticated redirect its caller supplies.
- The `redirect_url` mechanism itself is real and already relied upon elsewhere in this codebase: `proxy.ts`'s `auth.protect()` already redirects to `/sign-in?redirect_url=<returnBackUrl>` for protected-route deep links (regression-tested at [`proxy.test.ts#L315-L454`](../../proxy.test.ts#L315-L454)), and [`components/providers.tsx#L75`](../../components/providers.tsx#L75)'s `signUpFallbackRedirectUrl` is documented (in installed `@clerk/shared` type declarations) as a fallback used only "if there's no `redirect_url` in the path already" — confirming an explicit `redirect_url` on the initial `/sign-up` navigation would be honored, not overridden.
- [`app/(app)/app/layout.tsx`](<../../app/(app)/app/layout.tsx#L32-L51>) (`enforceEntitledAppUser`) is what then bounces the freshly-signed-up, still-unsubscribed user from the dashboard back to `/pricing?reason=subscription_required` — correct behavior given no subscription exists, but it's what turns the missing redirect context into a visible double round-trip for the user.

This is unrelated to, and does not regress, the already-verified-correct deep-link preservation mechanism for protected `/app/*` routes — that mechanism is sound; this gap is specific to the pricing page's own action-level redirect construction, which never participates in that mechanism at all.

## Impact

Every anonymous visitor who converts through the primary "Subscribe"/"Start free trial" CTA experiences an avoidable extra full page round-trip (through `/app/dashboard` and back) and loses their plan selection, landing back on `/pricing` to choose and click again. This is friction on the primary monetization path, not a correctness or security defect — fully recoverable, so it is P3 rather than higher.

## Proposed Fix / Resolution

Implemented on this branch:

- [`lib/routes.ts#L17-L58`](../../lib/routes.ts#L17-L58) centralizes the Clerk `redirect_url` query name, pricing query names, `toPricingRoute()`, and `toSignUpRedirectRoute()`.
- [`app/pricing/pricing-view.tsx#L15-L56`](../../app/pricing/pricing-view.tsx#L15-L56), [`#L82-L106`](../../app/pricing/pricing-view.tsx#L82-L106), [`#L144-L158`](../../app/pricing/pricing-view.tsx#L144-L158), and [`#L170-L285`](../../app/pricing/pricing-view.tsx#L170-L285) render anonymous pricing and manage-billing CTAs as `<Button asChild><Link>` sign-up links carrying the intended `/pricing?...` return destination, and mark a returned `?plan=` card with `aria-current="true"` plus visible `Selected plan` text. Signed-in users keep the existing server-action forms.
- [`app/pricing/page.tsx#L38-L65`](../../app/pricing/page.tsx#L38-L65) now preserves `isAuthenticated` in pricing data, and [`app/pricing/page.tsx#L164-L229`](../../app/pricing/page.tsx#L164-L229) normalizes the `plan` query parameter into the shared pricing presentation so the view can distinguish anonymous sign-up links, authenticated checkout actions, and the returned selected plan.
- [`app/pricing/subscribe-action.ts#L33-L36`](../../app/pricing/subscribe-action.ts#L33-L36) and [`app/pricing/manage-billing-action.ts#L17-L22`](../../app/pricing/manage-billing-action.ts#L17-L22) harden server-action unauthenticated fallbacks for session-expiry-between-render-and-submit cases.

**Scope note:** `PricingView` still has no separate plan-selection control — both plan cards are always rendered independently. This fix preserves the selected plan in the post-auth return URL and marks the returned card; adding richer visual emphasis beyond the small selected-plan marker would be optional follow-up polish, not required to repair the lost-context bug.

Regression coverage:

- [`lib/routes.test.ts`](../../lib/routes.test.ts#L126-L145) pins the route/query helpers.
- [`app/pricing/page.test.tsx`](../../app/pricing/page.test.tsx#L1117-L1231) pins anonymous plan and manage-billing links, signed-in checkout-form preservation, and returned-plan selection.
- [`app/pricing/subscribe-actions.test.ts`](../../app/pricing/subscribe-actions.test.ts#L66-L95), [`app/pricing/manage-billing-actions.test.ts`](../../app/pricing/manage-billing-actions.test.ts#L29-L45), and [`app/pricing/manage-billing-action.test.ts`](../../app/pricing/manage-billing-action.test.ts#L35-L54) pin the server-action fallbacks.

Status stays Open until this branch merges and deploy proof is recorded, then this bug can be archived.

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

This was the red-first failing test: before the implementation, the redirect target was the literal string `redirect:/sign-up` with no query string.

## Related

- BUG-055 (`docs/_archive/bugs/bug-055-post-login-redirects-to-landing-page.md`, already fixed) established the fallback-vs-explicit-redirect distinction this fix must respect — do not regress it.
- Distinct from, and does not affect, the already-verified-clean deep-link/`returnBackUrl` preservation for protected `/app/*` routes.
