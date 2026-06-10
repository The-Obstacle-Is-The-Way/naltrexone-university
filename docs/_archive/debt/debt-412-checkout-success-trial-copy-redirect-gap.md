# DEBT-412: Checkout Success Interstitial

**Priority:** P3 (trial UX polish; not blocking access or billing correctness)
**Created:** 2026-06-09
**Audit verified:** 2026-06-09 (post-PR-3 merge debt-register audit)
**Status:** Resolved 2026-06-10 — PR #416 (`feat/debt-412-checkout-interstitial`) shipped Option 2, a real checkout-success interstitial.
**Owner:** Trial UX / billing flow.
**Related:** [DEBT-410](../../debt/debt-410-free-trial-pathway-and-pricing-access-copy.md), [Debt Index](../../debt/index.md)

---

## Original Problem

DEBT-410 PR-3 added trial-aware checkout-success copy, but before this debt was resolved the checkout-success page normally redirected before that copy could render.

Pre-resolution evidence:

- `runCheckoutSuccessPage()` awaited `syncCheckoutSuccess()` before returning page markup.
- `syncCheckoutSuccess()` defaulted `redirectFn` to Next's `redirect` and called it for both non-entitled and entitled outcomes.
- The result type documented that post-redirect rendering was normally unreachable.

That made the new copy correct for intercepted-redirect tests and fallback rendering, but not reliably user-visible after a real Stripe Checkout return.

## User Impact

A no-card trial could still start correctly, sync entitlement, and redirect to the app. The missing piece was trust/confirmation copy at the exact moment the user returned from Checkout. The app-shell countdown later confirmed the trial state, but the checkout-success page itself did not normally reassure the user that no charge happened.

## Resolution

**Option 2 shipped — build a real checkout-success interstitial (owner, 2026-06-09).** Sync server-side, render trial/paid confirmation copy, and perform a controlled client-side redirect to the dashboard after a short delay. The trial confirmation moment ("no charge today") is the trust-critical beat of the no-card trial flow and is now genuinely user-visible, not redirect-fallback copy.

Implementation:

- **Eager server-side sync is unchanged.** `syncCheckoutSuccess()` still runs server-side and persists entitlement (customer mapping + subscription upsert) before anything renders (`app/(marketing)/checkout/success/checkout-success-sync.tsx:241-253`). No client-only Stripe sync path was introduced.
- **Outcome split in `checkout-success-sync.tsx`:**
  - Invalid / tampered / non-entitled / signed-out outcomes still server-redirect exactly as before (`/pricing?checkout=error`, `/pricing?reason=…`, Clerk sign-in redirect; `app/(marketing)/checkout/success/checkout-success-sync.tsx:97-133`, `app/(marketing)/checkout/success/checkout-success-sync.tsx:258-265`).
  - Entitled outcomes no longer server-redirect to the dashboard; the sync resolves with the synced subscription status so `page.tsx` renders the interstitial (`app/(marketing)/checkout/success/checkout-success-sync.tsx:268`).
- **Interstitial (server-rendered, status-driven copy):**
  - `inTrial` → "Your 7-day free trial has started — no charge today" + supporting line (`app/(marketing)/checkout/success/page.tsx:55-62`).
  - `active` and other entitled non-trial states → the paid "you're all set" confirmation (`app/(marketing)/checkout/success/page.tsx:55-58`).
  - Always renders a visible "Go to your dashboard" `<Button asChild>` link to `ROUTES.APP_DASHBOARD` as the manual escape hatch (BUG-089/BUG-090 discipline: never trap the user if JS or the timer fails; `app/(marketing)/checkout/success/page.tsx:67-73`).
  - `aria-live="polite"` region announces the confirmation/navigation status; accessible heading structure uses the documented utility-page H1 pattern (`app/(marketing)/checkout/success/page.tsx:54-65`).
- **Controlled client redirect:** a tiny `'use client'` component (no test-library React dependency) navigates to `ROUTES.APP_DASHBOARD` via the Next router after 3.5s, using `replace` semantics so the back button does not loop through the interstitial (`app/(marketing)/checkout/success/checkout-success-redirect.tsx:1-29`). Entitlement is already persisted server-side, so navigating to `/app/*` is safe.
- **Visual pattern:** the interstitial composes already-documented patterns (utility page H1, centered utility layout exception in Pattern Registry § 13.1, standard subtitle role, `<Button>` mandate); no new pattern-registry entry is required.

## Constraints

- Do not weaken the eager sync guarantee; entitlement must be persisted before the user reaches `/app/*`.
- Do not introduce a client-only Stripe sync path.
- Preserve invalid/tampered-session redirects to `/pricing?checkout=error`.
- If adding a client redirect, use a tiny client component with accessible copy and no test-library React dependency; static render tests cover markup, browser/E2E covers timed navigation if needed.

## Rejected Alternatives

- **Option 1: keep immediate server redirect and accept checkout-success copy as fallback-only.** Rejected by owner decision: the post-checkout confirmation is the moment the user most needs the "no charge today" reassurance, and the app-shell countdown only confirms it after the fact. Fallback-only copy leaves shipped UI dead in production.
- **Pretend the current PR-3 copy is fully user-facing.** Rejected: current code and type comments prove it is normally post-redirect fallback.
- **Remove the copy.** Rejected: it is still useful for intercepted/fallback rendering and keeps the status-derived copy path covered.
- **Retrofit redirect behavior into the already-merged DEBT-410 PR-3.** Rejected: not trivial or risk-free; it changes a billing return-flow contract beyond the PR-3 consistency fixes. Resolved instead by this dedicated PR.

## Acceptance Criteria

- The user sees "Your 7-day free trial has started — no charge today" after no-card trial checkout before dashboard navigation; paid (non-trial) checkout sees the paid confirmation.
- The interstitial always offers a visible "Go to your dashboard" link; the timed redirect is a convenience, not the only path forward.
- Invalid/tampered/non-entitled/signed-out outcomes still server-redirect exactly as before.
- Eager sync still runs and persists entitlement before dashboard access.
- Full gate and billing E2E pass.

## Verification

- Unit/static render: `app/(marketing)/checkout/success/page.test.ts` covers entitled return-with-status, active vs `inTrial` copy, aria-live, and dashboard escape hatch.
- Browser: `app/(marketing)/checkout/success/checkout-success-redirect.browser.spec.tsx` covers the 3.5s `router.replace(ROUTES.APP_DASHBOARD)` timer and unmount cleanup.
- CI: PR #416 passed typecheck, lint, unit, Browser Mode, integration, build, and authenticated E2E (35/35). This archive follow-up also re-ran the full local gate before push.
