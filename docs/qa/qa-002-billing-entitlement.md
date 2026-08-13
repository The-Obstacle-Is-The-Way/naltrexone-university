# QA-002: Billing & Entitlement (Pricing States, Trial, Portal, Gate Redirects)

**Status:** Draft
**Created:** 2026-08-13
**Surfaces:** `/pricing`, `/checkout/success`, `/app/billing`, the `/app/*` entitlement gate, sign-up CTA handoff
**Preconditions:** **Vercel preview or local dev with Stripe TEST keys and Clerk dev instance** — never run mutating billing steps against production (live Stripe). Sections: A needs a signed-out browser; B needs a signed-in **non-entitled** user (reset the E2E user to first-timer via `tests/e2e/helpers/subscription.ts` semantics, or use a fresh account); C needs a **first-timer** (trial is granted only on a user's first checkout); D needs a subscribed user.
**Execution modes:** Agent-executable except card entry on Stripe-hosted pages (human) — this flow is links, dialogs, and hosted redirects, which agents handle reliably. Production post-deploy smoke runs **Section A only**.
**Estimated time:** 15 min (A+B+D ≈ 8 min; C adds hosted-checkout time)
**Promotion gate:** yes
**Promoted to:** — (overlaps `pricing-unauthenticated.spec.ts`, `subscribe.spec.ts`, `trial-start.spec.ts`; this procedure adds the gate-redirect, cancel-banner, and portal round-trip edges)

Known environment quirk (not a bug): in Clerk development mode, the redirect back from Stripe Checkout can land on a sign-in screen on dev/preview — `docs/dev/deployment-environments.md`.

---

## Section A — Signed out (production-safe)

| # | Action | Expected |
|---|--------|----------|
| 1 | Go to `/pricing` signed out | Plans render with prices; trial framing present; legal links (`/terms`, `/privacy`) visible |
| 2 | Inspect the monthly CTA | Href is `/sign-up?redirect_url=%2Fpricing%3Fplan%3Dmonthly` (plan survives the auth round-trip) |
| 3 | Click it | Clerk sign-up form renders (do not create an account on production) |
| 4 | Visit `/app/dashboard` signed out | Bounced to sign-in — never a rendered app shell |

## Section B — Signed in, not entitled (the gate)

| # | Action | Expected |
|---|--------|----------|
| 5 | As a non-entitled user, go to `/app/dashboard` | Redirected to `/pricing?reason=subscription_required`; pricing shows the reason banner, not the app shell |
| 6 | Try `/app/practice` and `/app/bookmarks` directly | Same redirect — the gate covers every `/app/*` route |
| 7 | On `/pricing`, confirm subscribe CTAs are actionable | Subscribe buttons (not "already subscribed" state) |

## Section C — Trial and checkout lifecycle (test mode)

| # | Action | Expected |
|---|--------|----------|
| 8 | As a first-timer, press **Start 7-day free trial** | Hosted Stripe Checkout opens; **no card required** for the trial path |
| 9 | Complete it | Land on `/checkout/success` with the trial-started heading, then forwarded into `/app/*` |
| 10 | Check the app shell | Trial banner shows days remaining and **"Add a card to keep access"** |
| 11 | (Second, non-trial account) Start a paid checkout and **cancel** from the Stripe page | Returned to `/pricing?checkout=cancel` with the cancel banner; user remains non-entitled |
| 12 | ⚠ human: Start a paid checkout and pay with test card `4242 4242 4242 4242` | `/checkout/success` syncs entitlement; `/app/dashboard` loads without the trial banner |

## Section D — Subscribed states and portal round-trip

| # | Action | Expected |
|---|--------|----------|
| 13 | As a subscribed user, go to `/pricing` | **"You're already subscribed"** with **Go to Dashboard** → lands on `/app/dashboard` |
| 14 | Go to `/app/billing` | Plan, status, and current-period dates render and match the Stripe test dashboard |
| 15 | Press **Manage in Stripe** | Stripe Billing Portal (test mode) opens |
| 16 | In the portal, schedule **cancel at period end**, then return | Back on `/app/billing` (portal `return_url`); cancellation banner visible; **app access still works** — entitlement holds until period end |
| 17 | Re-enter the portal and undo the cancellation | Banner clears after return/refresh |
| 18 | Optional deep variant | Drive a subscription to `past_due` with a Stripe test clock + failing card: app shell shows the `PastDueBanner` ("Your payment failed…") while access continues (pastDue is an entitled status) |

## Visual checks

- [ ] Reason and checkout banners use semantic status tokens (no raw palette) — `docs/frontend/pattern-registry.md` feedback patterns
- [ ] Cancellation banner uses semantic warning tokens — enforced by `theme-token-regression.test.tsx`, eyeball it anyway
- [ ] Pricing legal-consent links carry the canonical focus ring — `docs/frontend/standards.md` §3
- [ ] `/pricing` at 390×844: plan cards stack without overflow; CTAs full-width tappable

## Evidence

Screenshots: step 5 (reason banner), step 10 (trial banner), step 16 (cancellation banner). Representative WebP → `docs/qa/assets/qa-002/`.

## On failure

Entitlement-gate failures (steps 4–6) are **security findings** — file as `BUG-NNN` at elevated priority. Stripe-flow failures: capture the Stripe test-dashboard event log alongside the UI evidence before filing.
