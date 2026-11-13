# Billing & Entitlement (Pricing States, Trial, Portal, Gate Redirects)

**Status:** Draft
**Created:** 2026-08-13
**Surfaces:** `/pricing`, `/checkout/success`, `/app/billing`, the `/app/*` entitlement gate, sign-up CTA handoff
**Preconditions:** **Vercel preview or local dev with Stripe TEST keys and Clerk dev instance** — never run mutating billing steps against production (live Stripe). A needs a signed-out browser. B and C share one new TEST-mode account per run. Sign it up through the app with a Clerk test email address (one containing `+clerk_test`, which needs no inbox on the dev instance) that starts with `qa-temp-<YYYYMMDD>-`, the run's date, so the dev instance's user list tells it apart from the permanent QA account, and never reuse it in a later run. It is the **non-entitled** user for B and the first-timer for steps 8–10a, since a trial starts only on a user's first checkout. Before step 11, make it the prior-subscriber who is non-entitled now: cancel its subscription immediately in the Stripe test dashboard, then wait until `/app/dashboard` redirects to `/pricing` and the plans offer **Subscribe monthly** instead of a trial. On a preview, D uses the permanent QA account named in Practice Core Flows' Preconditions: bring it to the entitled state those Preconditions describe before step 13, and finish step 17 so that step 16's cancellation is undone. A local run may instead use the subscriber that step 12 produces. Optional step 18 needs one more `qa-temp-` account. After it first signs in, so its app user exists, and before its first checkout: read its `users.id` with a read-only query (an explicit `DATABASE_URL`, plus `DB_TARGET_ACK` for a remote database, per AGENTS.md's Non-Negotiables); create its TEST-mode Stripe customer on a test clock with `metadata.user_id` set to that id; and wait until a Stripe Dashboard search for `metadata['user_id']:'<id>'` finds exactly that customer, since Stripe's search can lag a new customer by about a minute. The app reuses that customer only while the account has no `stripe_customers` row and exactly one customer matches; otherwise it uses the mapped customer, refuses several matches, or creates a customer without a test clock. Skip step 18 when no such customer exists.
**Execution modes:** Human in full. Agent modes can execute A–B and app-side reads; hosted billing state changes are marked `⚠ human/PW`, and card entry is human-only. Required Playwright covers both pricing CTAs through the Stripe-origin redirect boundary and separately proves genuine Stripe-triggered annual/trial objects through success sync, persistence, and entitlement. It does not complete the exact application-created Session. The uninterrupted hosted journeys (`stripe-hosted-*.spec.ts`: trial start, paid checkout, trial add-card and portal cancellation) run only as daily/manual observational compatibility probes because Stripe owns the markup and documents UI automation as unsupported; they are not merge gates or substitutes for this human procedure. Production post-deploy smoke runs **Section A only**.
**Estimated time:** 15 min (A+B+D ≈ 8 min; C adds hosted-checkout time)
**Promotion gate:** yes
**Promoted to:** — (overlaps `pricing-unauthenticated.spec.ts`, `subscribe.spec.ts`, required `checkout-redirect.spec.ts`/`checkout-success-provider.spec.ts`, and observational `stripe-hosted-*.spec.ts`; this procedure adds the gate-redirect, cancel-banner, portal round-trip, and supported human hosted-Checkout proof)

Known environment quirk (not a bug): in Clerk development mode, the redirect back from Stripe Checkout can land on a sign-in screen on dev/preview — `docs/architecture/environments.md`.

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
| 7 | On `/pricing`, confirm plan CTAs are actionable | **Start 7-day free trial** for a first-timer, or **Subscribe monthly** / **Subscribe annual** for a user no longer trial-eligible (never the "already subscribed" state) |

## Section C — Trial and checkout lifecycle (test mode)

| # | Action | Expected |
|---|--------|----------|
| 8 | ⚠ As a first-timer, press **Start 7-day free trial**, review the consent dialog, check the unchecked renewal opt-in, and press **Start free trial** | The dialog's **Start free trial** does nothing until the opt-in is checked (DEBT-414 F03); then hosted Stripe Checkout opens, and **no card is required** for the trial path |
| 9 | ⚠ Accept the hosted Terms/Privacy checkbox and press the hosted start-trial/subscribe/continue button | Land on `/checkout/success` with the trial-started heading, then forwarded to `/app/dashboard` |
| 10 | Check the app shell, then press **Add a card to keep access** | Trial banner shows days remaining and the button, which opens the add-card consent dialog: the plan's terms in bold and an unchecked renewal opt-in; **Add a card** does nothing until the opt-in is checked (DEBT-414 F03b). Press **Cancel** to close it |
| 10a | ⚠ human: Press **Add a card to keep access** again, check the opt-in, press **Add a card**, and save test card `4242 4242 4242 4242` with any future expiry and any three-digit CVC | Stripe's page displays your email without asking you to type it. Returned to `/app/billing`, which says Stripe is confirming the card until the `checkout.session.completed` webhook is delivered. After a refresh it says **Your card is saved.** and states the renewal. The Stripe test Dashboard shows that card as the trial subscription's default payment method, and the banner states the renewal instead of offering **Add a card** (BUG-308) |
| 11 | ⚠ As the prior-subscriber who is non-entitled now (Preconditions), start a paid checkout and **cancel** from the Stripe page | Returned to `/pricing?checkout=cancel` with the cancel banner; user remains non-entitled |
| 12 | ⚠ human: With that prior-subscriber, start a paid checkout and pay with test card `4242 4242 4242 4242`, any future expiry, and any three-digit CVC | `/checkout/success` syncs entitlement; `/app/dashboard` loads without the trial banner |

## Section D — Subscribed states and portal round-trip

| # | Action | Expected |
|---|--------|----------|
| 13 | As a subscribed user, go to `/pricing` | **"You're already subscribed"** with **Go to Dashboard** → lands on `/app/dashboard` |
| 14 | Go to `/app/billing` | Plan and status render and match the Stripe test dashboard (the period-end date appears only when cancellation is scheduled) |
| 15 | Press **Manage in Stripe** | Stripe Billing Portal (test mode) opens |
| 16 | ⚠ In the portal, schedule **cancel at period end**, then return | Back on `/app/billing` (portal `return_url`); after the `customer.subscription.updated` webhook is delivered, refresh and see the cancellation banner; **app access still works** until the recorded period end |
| 17 | ⚠ Re-enter the portal and undo the cancellation | After the update webhook is delivered, the banner clears on return/refresh |
| 18 | ⚠ Optional deep variant | Drive a subscription to `past_due` with a Stripe test clock + failing card (recipe: attach the customer to a test clock **before** creating the subscription; start its trial, since a first checkout is always one, and save test card `4000 0000 0000 0341` through **Add a card to keep access** — it attaches but its charges fail; advance the clock past the trial's end and wait for it to leave the advancing state; poll the subscription until `status = past_due`; allow webhook delivery to sync the app before checking): while its recorded period end is still in the future, the app shell shows the `PastDueBanner` ("Your payment failed…") and access continues; at or after period end, the same status is not entitled |

## Visual checks

- [ ] Reason and checkout banners use semantic status tokens (no raw palette) — `docs/design-system/pattern-registry.md` feedback patterns
- [ ] Cancellation banner uses semantic warning tokens — a judgment check: the machine layer (`theme-token-regression`) polices raw buttons, undocumented opacity, and focus rings, not banner tone
- [ ] Pricing legal-consent links carry the canonical focus ring — `docs/design-system/standards.md` §3
- [ ] `/pricing` at 390×844: plan cards stack without overflow; CTAs full-width tappable

## Evidence

Screenshots: step 5 (reason banner), step 10 (trial banner), step 16 (cancellation banner). Attach representative screenshots to the pull request or the run's report.

## On failure

Entitlement-gate failures (steps 4–6) are **security findings** — file a bug record in `docs/records/` as `BUG-NNN` at elevated priority. Stripe-flow failures: capture the Stripe test-dashboard event log alongside the UI evidence before filing. A scheduled hosted-smoke failure is compatibility evidence to investigate, not permission to waive a genuinely required red check and not a veto on an unrelated pull request.
