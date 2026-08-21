# QA-002: Billing & Entitlement (Pricing States, Trial, Portal, Gate Redirects)

**Status:** Draft
**Created:** 2026-08-13
**Surfaces:** `/pricing`, `/checkout/success`, `/app/billing`, the `/app/*` entitlement gate, sign-up CTA handoff
**Preconditions:** **Vercel preview or local dev with Stripe TEST keys and Clerk dev instance** — never run mutating billing steps against production (live Stripe). Prepare separate TEST-mode accounts before the run: A needs a signed-out browser; B needs a signed-in **non-entitled** user; C steps 8–10 need a first-time non-entitled user (trial is granted only on a user's first checkout), while steps 11–12 need a prior-subscriber who is non-entitled now; D can use the active subscriber produced by step 12 or another active subscriber. Before this Draft becomes Active, record the named accounts and their reset/provisioning instructions here: the repo exposes only one E2E Clerk credential pair, and `tests/e2e/helpers/subscription.ts` is test-runner code, not an operator reset command. Step 18 additionally requires a separately provisioned app user whose TEST-mode Stripe customer was attached to a test clock before subscription creation.
**Execution modes:** Human in full. Agent modes can execute A–B and app-side reads; hosted billing state changes are marked `⚠ human/PW`, and card entry is human-only. Required Playwright covers both pricing CTAs through the Stripe-origin redirect boundary and separately proves genuine Stripe-triggered annual/trial objects through success sync, persistence, and entitlement. It does not complete the exact application-created Session. The two uninterrupted hosted journeys run only as weekly/manual observational compatibility probes because Stripe owns the markup and documents UI automation as unsupported; they are not merge gates or substitutes for this human procedure. Production post-deploy smoke runs **Section A only**.
**Estimated time:** 15 min (A+B+D ≈ 8 min; C adds hosted-checkout time)
**Promotion gate:** yes
**Promoted to:** — (overlaps `pricing-unauthenticated.spec.ts`, `subscribe.spec.ts`, required `checkout-redirect.spec.ts`/`checkout-success-provider.spec.ts`, and observational `stripe-hosted-*.spec.ts`; this procedure adds the gate-redirect, cancel-banner, portal round-trip, and supported human hosted-Checkout proof)

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
| 7 | On `/pricing`, confirm plan CTAs are actionable | **Start 7-day free trial** for a first-timer, or **Subscribe Monthly** / **Subscribe Annual** for a user no longer trial-eligible (never the "already subscribed" state) |

## Section C — Trial and checkout lifecycle (test mode)

| # | Action | Expected |
|---|--------|----------|
| 8 | ⚠ As a first-timer, press **Start 7-day free trial** | Hosted Stripe Checkout opens; **no card required** for the trial path |
| 9 | ⚠ Accept the hosted Terms/Privacy checkbox and press the hosted start-trial/subscribe/continue button | Land on `/checkout/success` with the trial-started heading, then forwarded to `/app/dashboard` |
| 10 | Check the app shell | Trial banner shows days remaining and **"Add a card to keep access"** |
| 11 | ⚠ As the separate prior-subscriber who is non-entitled now, start a paid checkout and **cancel** from the Stripe page | Returned to `/pricing?checkout=cancel` with the cancel banner; user remains non-entitled |
| 12 | ⚠ human: With that prior-subscriber, start a paid checkout and pay with test card `4242 4242 4242 4242`, any future expiry, and any three-digit CVC | `/checkout/success` syncs entitlement; `/app/dashboard` loads without the trial banner |

## Section D — Subscribed states and portal round-trip

| # | Action | Expected |
|---|--------|----------|
| 13 | As a subscribed user, go to `/pricing` | **"You're already subscribed"** with **Go to Dashboard** → lands on `/app/dashboard` |
| 14 | Go to `/app/billing` | Plan and status render and match the Stripe test dashboard (the period-end date appears only when cancellation is scheduled) |
| 15 | Press **Manage in Stripe** | Stripe Billing Portal (test mode) opens |
| 16 | ⚠ In the portal, schedule **cancel at period end**, then return | Back on `/app/billing` (portal `return_url`); after the `customer.subscription.updated` webhook is delivered, refresh and see the cancellation banner; **app access still works** until the recorded period end |
| 17 | ⚠ Re-enter the portal and undo the cancellation | After the update webhook is delivered, the banner clears on return/refresh |
| 18 | ⚠ Optional deep variant | Drive a subscription to `past_due` with a Stripe test clock + failing card (recipe: attach the customer to a test clock **before** creating the subscription; subscribe with test card `4000 0000 0000 0341` — it attaches but its charges fail; advance the clock past the period end and wait for it to leave the advancing state; poll the subscription until `status = past_due`; allow webhook delivery to sync the app before checking): while its recorded period end is still in the future, the app shell shows the `PastDueBanner` ("Your payment failed…") and access continues; at or after period end, the same status is not entitled |

## Visual checks

- [ ] Reason and checkout banners use semantic status tokens (no raw palette) — `docs/frontend/pattern-registry.md` feedback patterns
- [ ] Cancellation banner uses semantic warning tokens — a judgment check: the machine layer (`theme-token-regression`) polices raw buttons, undocumented opacity, and focus rings, not banner tone
- [ ] Pricing legal-consent links carry the canonical focus ring — `docs/frontend/standards.md` §3
- [ ] `/pricing` at 390×844: plan cards stack without overflow; CTAs full-width tappable

## Evidence

Screenshots: step 5 (reason banner), step 10 (trial banner), step 16 (cancellation banner). Representative WebP → `docs/qa/assets/qa-002/`.

## On failure

Entitlement-gate failures (steps 4–6) are **security findings** — file as `BUG-NNN` at elevated priority. Stripe-flow failures: capture the Stripe test-dashboard event log alongside the UI evidence before filing. A scheduled hosted-smoke failure is compatibility evidence to investigate, not permission to waive a genuinely required red check and not a veto on an unrelated pull request.
