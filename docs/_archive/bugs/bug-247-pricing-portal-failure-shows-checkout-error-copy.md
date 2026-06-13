# BUG-247: Pricing-Page "Manage Billing" Portal Failures Show Checkout-Failure Copy ("Checkout failed. Please try again.")

**Status:** RESOLVED + archived (2026-06-13). Fixed in PR #424 (squash `424df206`, `main` fast-forwarded): pricing-page billing-portal failures now redirect to `/pricing?portal=error` and render portal-specific copy ("Couldn't open the billing portal. Please try again."), reserving `checkout=error` for actual checkout failures. All portal error codes (`INTERNAL_ERROR`/`STRIPE_ERROR`/`RATE_LIMITED`/`NOT_FOUND`) and raw throws flow through the single configured failure redirect in `manage-billing-core`; `UNAUTHENTICATED` → `/sign-up` is unchanged. Owner-graded, full gate green (typecheck, lint, unit 2815, browser 297, integration 111, build, E2E 36) + CodeRabbit approved on the exact head `c638c376` (after a real `CHANGES_REQUESTED` → `APPROVED` cycle).
**Priority:** P3 (wrong but recoverable user-facing copy on a real recovery path; the sibling route already has the correct copy)
**Date:** 2026-06-11
**Family:** Billing / pricing copy / portal failure handling
**Related:** [DEBT-180](../debt/debt-180-duplicated-manage-billing-files.md) (consolidated the two manage-billing actions; recorded the divergent redirects as drift-prone), [BUG-165](./bug-165-app-billing-missing-unauthenticated-redirect.md) / [BUG-166](./bug-166-manage-billing-core-swallows-errors-silently.md) (manage-billing-core error paths), [BUG-114](./bug-114-subscribe-action-leaks-error-codes-to-url.md) (shaped `checkout=error` for *subscribe* failures)

---

## Description

When the **Manage Billing** action on the pricing page fails to create a Stripe billing-portal session, the user is redirected to `/pricing?checkout=error` and shown the banner **"Checkout failed. Please try again."** — describing a checkout the user never attempted. The action was a billing-portal open, not a checkout. The identical failure on the app billing page (`/app/billing`) is handled correctly with portal-specific copy ("Couldn't open the billing portal. Please try again."), which proves the copy distinction is intended; the pricing side simply reuses the wrong bucket.

This lands a payment-troubled user (e.g. an `unpaid`/`paused` subscriber redirected with `reason=manage_billing`) on a message about a failed checkout, directly above the still-rendered "Subscription needs attention / Manage billing in Stripe" card.

## Steps to Reproduce

1. Be a signed-in user with a non-entitled-but-recoverable subscription (e.g. `unpaid` with an active period) → app layout redirects to `/pricing?reason=manage_billing`.
2. Click **Manage Billing** while Stripe portal-session creation fails (`STRIPE_ERROR` from a missing portal-session URL or an already-open Stripe circuit; `INTERNAL_ERROR` from an exhausted raw Stripe/network failure handled by `createAction`; `RATE_LIMITED` after >20 portal attempts/min; or `NOT_FOUND` when no Stripe customer mapping exists).
3. Observe redirect to `/pricing?checkout=error` and the banner "Checkout failed. Please try again." above the "Subscription needs attention" card.

## Root Cause

1. `app/(app)/app/layout.tsx:43-45` — non-entitled user redirected to `/pricing?reason=${reason}` (reason `manage_billing` from `src/domain/services/entitlement.ts:31`, or `payment_processing` from `:29`).
2. `app/pricing/page.tsx:175-177` — `buildPricingPresentation` sets `showManageBillingAction = true` for `manage_billing`/`payment_processing`, passing `manageBillingAction` into `PricingView`.
3. `app/pricing/pricing-view.tsx:62-73` (banner button) and `:103-118` ("Subscription needs attention" card) submit `action={manageBillingAction}`.
4. `app/pricing/manage-billing-actions.ts` → `app/pricing/manage-billing-action.ts:15-21` — the pricing wrapper hardcodes `redirects.failure = ${ROUTES.PRICING}?checkout=error` (only `UNAUTHENTICATED` is special-cased → `/sign-up`).
5. `lib/manage-billing/manage-billing-core.ts:46-52` — any thrown error redirects to the configured failure URL, and any non-ok result whose code is not `UNAUTHENTICATED` also redirects there. Real production codes that reach this branch include `INTERNAL_ERROR` from raw thrown Stripe/network failures converted by `createAction`/`handleError` (`src/adapters/controllers/create-action.ts:53-69`, `src/adapters/controllers/action-result.ts:51-61`), `STRIPE_ERROR` from a missing portal-session URL (`src/adapters/gateways/stripe/stripe-portal.ts:41-45`) or already-open Stripe circuit (`src/adapters/gateways/stripe/stripe-retry.ts:8-16`, `src/adapters/shared/circuit-breaker.ts:115-119`), `RATE_LIMITED` from `PORTAL_SESSION_RATE_LIMIT` (`billing-controller.ts:157-166`), and `NOT_FOUND` from a missing Stripe customer mapping (`create-portal-session.ts:23-25`).
6. `app/pricing/page.tsx:89-94` — `getPricingBanner` maps `checkout === 'error'` to the error-tone banner **"Checkout failed. Please try again."**
7. Contrast (intended copy exists): `app/(app)/app/billing/manage-billing-action.ts:17-19` redirects the identical failure to `/app/billing?error=portal_failed`, and `app/(app)/app/billing/page.tsx:126-130` renders **"Couldn't open the billing portal. Please try again."**

## Impact

- A user actively trying to fix a billing problem is told their *checkout* failed — misleading and slightly alarming, on the exact path where clarity matters most (payment recovery).
- Recoverable in one retry, and only triggers when portal creation actually fails, so impact is bounded — hence P3, not higher.

## Expected Fix

Use the pricing-specific portal-failure bucket.

1. Change the pricing-side manage-billing wrapper's configured failure redirect from `/pricing?checkout=error` to `/pricing?portal=error`.
2. Extend `PricingSearchParams` in `app/pricing/page.tsx:65-69` with `portal?: string | string[] | undefined`, normalize `searchParams.portal` inside `getPricingBanner` (`:75-94`), and add a branch rendering "Couldn't open the billing portal. Please try again." for `portal === 'error'`.
3. Keep `UNAUTHENTICATED → /sign-up` unchanged.
4. Keep `checkout=error` reserved for actual subscribe/checkout failures (its BUG-114 origin).

Do **not** redirect the pricing failure to `/app/billing?error=portal_failed` for this fix. The app-billing route remains the sibling proof of intended portal-failure copy, but the pricing page should own its own portal-failure banner because the failure starts from pricing-page recovery CTAs.

## Verification

- [ ] Test: pricing Manage Billing failure (`INTERNAL_ERROR`/`STRIPE_ERROR`/`RATE_LIMITED`/`NOT_FOUND`) renders portal-failure copy, not checkout-failure copy.
- [ ] Test: subscribe-action failures still render "Checkout failed. Please try again." (no regression of the `checkout=error` bucket).
- [ ] Test: `UNAUTHENTICATED` portal failure still redirects to `/sign-up`.
- [ ] `pnpm test --run` green.

## Surfaces Confirmed

- The redirect *target* is the only defect; auth handling (`UNAUTHENTICATED → /sign-up`) and the underlying portal creation are correct.
- The app-billing sibling already demonstrates the intended portal-failure copy, so this is a copy/bucket mismatch, not a new UX decision.
- `app/pricing/manage-billing-action.test.ts` pins the redirect target but does not adjudicate the banner wording, which is why the mismatch survived.
- Distinct from BUG-232 (manage-billing idempotency-key gap); this is purely failure-copy routing.
