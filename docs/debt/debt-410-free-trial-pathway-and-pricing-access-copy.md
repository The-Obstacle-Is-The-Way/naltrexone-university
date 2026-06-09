# DEBT-410: Free-Trial Pathway + Pricing Access-Copy Correction

**Priority:** P1 (acquisition-blocking pre-launch feature; the bundled banner-copy item is P3)
**Created:** 2026-06-06
**Audit corrected:** 2026-06-07 (post-PR-1 docs-only audit against current repo citations + Stripe primary sources); 2026-06-09 (post-PR-2 audit against current repo citations and PR-3 seams); 2026-06-09 (PR-3 branch consistency audit: validated env access + trial-neutral canceled-row copy); 2026-06-09 (post-PR-3 merge debt-register audit)
**Status:** **DECIDED specification — PR-1 shipped (`8e2e1489`); PR-2 shipped (`f7463dec`); PR-3 shipped (`3ba5576a`); PR-4 remains.** PR-4 is config + rollout only.
**Baseline note:** Current `dev`/`main` also include the npm-minor-and-patch bump `4d20fede` (#412). Its diff is `package.json` + `pnpm-lock.yaml` only, updating build/test tooling (`vite`, `vitest`, `@vitest/*`, `lint-staged`, `tsx`, and transitive parser/bundler packages). It does not change React, Next, Tailwind, Testing Library, app UI code, or DEBT-410 seams.
**Author:** Paydown campaign (web research + primary-source Stripe verification + codebase audit).
**Source:** Owner request to (a) repair the "Subscription required to access the app." pricing copy and (b) add a free-trial pathway before dogfooding and first-user acquisition. Owner confirmed the **no-card** model ("try it free; enter a card only to keep going") and asked for a single decided spec with rationale — explicitly *no optionality*.
**Related:** [Debt Index](./index.md), [DEBT-332](./debt-332-security-posture-audit.md) (billing-flow CSP `form-action`), [DEBT-406 archived](../_archive/debt/debt-406-stripe-live-endpoint-version-reconciliation.md) (live webhook endpoint pinned to `2026-05-27.dahlia`), [DEBT-412](./debt-412-checkout-success-trial-copy-redirect-gap.md) (checkout-success trial copy is redirect-fallback only), [DEBT-413](./debt-413-remove-free-trial-enabled-flag.md) (remove the rollout flag after PR-4/GA); Stripe primary sources cited inline in §B.2–B.4.

---

## 0. Decisions (final)

Every decision below is committed. Rationale follows in the body; rejected alternatives with their reasons are in §B.17. There are no choices left for the reader to make.

| # | Decision | Rationale (short) |
|---|----------|-------------------|
| D1 | **Trial length: 7 days** | Instant-value product + deadline-driven exam buyers; benchmarks show ~no trial→paid loss vs 14 while 7 manufactures urgency and kills procrastination. |
| D2 | **No-card (opt-in) trial; hard wall at expiry** | Pre-launch, the scarce asset is *trial starts* (a card wall cuts them ~70%). Owner-confirmed model: try free, enter a card only to continue. |
| D3 | **Trial mechanism: Stripe Checkout `subscription_data.trial_period_days`** (NOT Trial Offers) | This is Stripe's **only documented Checkout-compatible** way to trial on hosted Checkout. Trial Offers are explicitly incompatible with Checkout and are preview-only. See §B.2 — quote-backed. |
| D4 | **No-card end behavior: `missing_payment_method: 'cancel'`** | The value Stripe **demonstrates in code** for Checkout; cleanest fit — reuses our existing `customer.subscription.deleted` handling and "subscribe again" flow. |
| D5 | **Default plan: Annual ($199/yr) visually primary; both plans trial-able** | Exam need has a fixed end date → annual matches the study horizon; ~51% lower churn, ~2× LTV. |
| D6 | **Architecture: Stripe is the single source of truth (Stripe-level trial)** | `inTrial` is already an entitled domain status; reuses all existing entitlement + webhook code. No parallel app-level trial clock. |
| D7 | **No schema changes** | Eligibility reuses the existing `findByUserId` lookup; the trial countdown reuses the existing `currentPeriodEnd` column (which equals `trial_end` during a trial). PR-3 surfaces that value as `trialEndsAt` through entitlement/auth/app-layout output; no DB column is needed. Verified — §B.1 and §B.8. |
| D8 | **Trial-reminder emails: Stripe-native trial-ending email** | No app email infrastructure exists (verified). A first-party lifecycle-email system is explicitly future scope (§B.10). |
| D9 | **Eligibility: first-time users only** (`findByUserId === null`) | One trial per user, enforced by the existing per-user subscription record + the existing dual blocking-status checks. |
| D10 | **Kill-switch: `FREE_TRIAL_ENABLED` env flag** | Billing-touching feature → a no-redeploy off-switch, following the existing `NEXT_PUBLIC_SKIP_CLERK` enum-flag precedent. Operational safety, not a product toggle. |
| D11 | **Banner copy:** PR-1 shipped anonymous suppression; PR-3 rewords first-timer redirects to trial-forward and uses trial-neutral ended-access copy for canceled rows | Anonymous visitors no longer see the banner; first-timer redirect copy becomes *false* once a trial exists. Canceled rows do not prove trial origin, so their copy must not overclaim "free trial ended." |

---

## 1. Why this is filed as debt (not just a feature)

Two concrete shortcomings are now code-complete; only PR-4 rollout/config remains:

1. **The pricing surface used to misrepresent anonymous access; PR-1 fixed that narrow defect.** Before squash `8e2e1489`, `loadPricingData()` returned `reason: 'subscription_required'` for logged-out visitors. Current code returns `reason: null` in the no-user branch (`app/pricing/page.tsx:56-66`), so anonymous `/pricing` visits do not get a banner. PR-3 keeps that behavior and adds trial-aware presentation on top of the explicit reason/entitlement state (`app/pricing/page.tsx:87-165`, `app/pricing/page.tsx:167-199`, rendered at `app/pricing/pricing-view.tsx:50-84`).
2. **The low-friction path is wired and PR-3 makes it user-facing behind the existing default-off flag.** PR-2 shipped the no-card Checkout wiring behind `FREE_TRIAL_ENABLED`; PR-3 shipped pricing CTAs, app-shell countdown, checkout-success fallback copy, and trial-aware pricing redirect copy in squash `3ba5576a`. PR-4 still has to enable the production config, Stripe-native trial emails, Customer Portal payment-method updates, and E2E rollout coverage.

---

# PART A — Pricing access-copy correction (P3) — SHIPPED in PR-1

## A.1 PR-1 shipped behavior (verified)

- `loadPricingData()` returns `reason: null` when there is no signed-in user (`app/pricing/page.tsx:56-66`).
- PR-3 keeps both render paths behind the shared `buildPricingPresentation()` helper so banner/CTA decisions do not drift (`app/pricing/page.tsx:167-199`, `app/pricing/page.tsx:202-229`, `app/pricing/page.tsx:233-267`).
- `getPricingBanner` maps explicit `subscription_required` to trial-forward copy only when `FREE_TRIAL_ENABLED` is on and no subscription row exists; canceled rows get trial-neutral ended-access copy because a canceled row can also represent a former paid subscriber (`app/pricing/page.tsx:115-133`).
- PR-1 regression tests pin the shipped behavior: anonymous `loadPricingData()` returns `reason: null` (`app/pricing/page.test.tsx:595-614`), anonymous render omits the "Subscription required" copy (`app/pricing/page.test.tsx:932-940`), logged-in non-entitled redirects still show it (`app/pricing/page.test.tsx:1052-1060`), and query-param banners still render unchanged (`app/pricing/page.test.tsx:1151-1189`).

## A.2 Decision / remaining status (final)

1. **Shipped in PR-1:** anonymous visitors → no "subscription required" banner. `loadPricingData` returns `reason: null` for logged-out users; the pricing cards and CTAs speak for themselves.
2. **Shipped in PR-3 (`3ba5576a`):** reword the first-timer genuine redirect case (`subscription_required` + no subscription row) to trial-forward copy: **"Start your free trial to access the app — no card required."** Canceled rows use **"Your access ended — choose a plan to continue."** because the current schema intentionally has no trial-origin discriminator (`app/pricing/page.tsx:115-133`).
3. **Shipped in PR-1:** the other reason banners (`manage_billing`, `payment_processing`, `subscription_canceled`) stayed unchanged because they are correct and useful.

Do not re-implement PR-1 or PR-3. PR-4 owns only rollout/config and E2E verification.

---

# PART B — Free-trial pathway (P1)

## B.1 Current state — the codebase is already trial-shaped (verified)

The original billing design anticipated trials. Confirmed by reading the code:

| Capability | Where | Status |
|---|---|---|
| Domain status `inTrial` exists and **grants entitlement** | `src/domain/value-objects/subscription-status.ts:10,29-33` | ✅ access works during trial, zero new gating |
| `paused`/`canceled` are not entitled | `src/domain/value-objects/subscription-status.ts:29-33` (absent from `EntitledStatuses`) | ✅ trial expiry correctly revokes access |
| `trialing`/`paused` block a duplicate Checkout (both layers) | `src/domain/value-objects/subscription-status.ts:40-41`; gateway `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:21-28` | ✅ prevents double-trial |
| Stripe↔domain status map incl. `trialing→inTrial`, `paused→paused` | `src/adapters/gateways/stripe/stripe-subscription-status.ts:7-27` | ✅ |
| DB enum includes `trialing` + `paused` | `db/schema.ts:52-62`; table `db/schema.ts:177-210` | ✅ no migration needed |
| `customer.subscription.trial_will_end` already routes through the generic path and re-syncs state | schemas `src/adapters/gateways/stripe/stripe-webhook-schemas.ts:74-83`; processor `src/adapters/gateways/stripe/stripe-webhook-processor.ts:114-146`; test `src/adapters/gateways/stripe-payment-gateway.test.ts:593-629` | ✅ already handled (returns a `subscriptionUpdate`) |
| **Webhook schema + normalizer read period end from `items.data[0].current_period_end`** (the modern location) | schema `src/adapters/gateways/stripe/stripe-webhook-schemas.ts:8-27`; normalizer `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts:79-80,98`; Stripe mixed-interval billing-period docs ([docs.stripe.com/billing/subscriptions/mixed-interval](https://docs.stripe.com/billing/subscriptions/mixed-interval)) | ✅ no latent bug; Stripe confirms that when a subscription has a future-dated trial end, current-period end dates are set to the trial-end date → countdown needs no new field |
| **Eligibility gate already present**: the checkout use case looks up `findByUserId` and PR-2 computes the first-timer trial days | `src/application/use-cases/create-checkout-session.ts:113-134` | ✅ `subscription === null` + flag on ⇒ first-timer ⇒ grant trial |
| Stripe API pinned `2026-05-27.dahlia` (GA channel), last reviewed 2026-06-04 | `lib/stripe-api-version.ts:1`; `lib/stripe.ts:11-23` | ✅ trial fields valid; not on the preview channel Trial Offers require |

**What PR-2 shipped:** before PR-2, we never passed a trial parameter when creating the Checkout Session (`subscription_data` carried only `metadata.user_id`). PR-2 added the Checkout trial params (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts:391-424`), a trial-scoped checkout-session variant fingerprint, the `FREE_TRIAL_ENABLED` plumbing (`lib/env.ts:47`; `lib/container/use-cases.ts:61-69`), and the gated Stripe test-clock smoke (`tests/integration/stripe-trial-clock-smoke.integration.test.ts:202-270`). PR-3 then added the trial-specific pricing/app-shell UI and `trialEndsAt` data seam. After PR-3, the remaining work is Stripe Dashboard trial-reminder/Customer Portal config, target-env rollout, and E2E coverage. **No schema, webhook, or persistence changes.**

## B.2 The "legacy" question — settled with primary sources

The owner's question is exactly right to ask: *if Stripe has a newer "gold-standard" trial system, why build on the one Stripe calls "legacy"?* The answer, verified against Stripe's own current docs (and independently re-fetched by me), is decisive: **for a hosted-Checkout product, `subscription_data.trial_period_days` is the current documented path and the Trial Offer system literally cannot be used with Checkout.** "Legacy" here is a naming label on the direct Subscriptions-API free-trials page, not a Checkout deprecation.

**Evidence (verbatim quotes):**

1. **Trial Offers are explicitly incompatible with Checkout** — Stripe, *Configure trial offers on subscriptions* ([docs.stripe.com/billing/subscriptions/trials](https://docs.stripe.com/billing/subscriptions/trials)):
   > "If you use Checkout, you can't use trial offers. To create trialing subscriptions through Checkout, you must use legacy free trials with `trial_end`. See Configure free trials."
   Stripe's Checkout guide then documents both `subscription_data.trial_period_days` and `subscription_data.trial_end`; this spec chooses the fixed day-count form.

2. **Trial Offers require leaving the GA channel and migrating billing mode** — same page, "Before you begin":
   > "Your integration must be on **2026-03-25.preview**."
   > "You must upgrade your subscription from `classic` billing mode to `flexible` billing mode to use trial offers."
   Our app is pinned to `2026-05-27.dahlia` — the **GA/release** channel, not the preview channel Trial Offers demand (`lib/stripe-api-version.ts:1`; `lib/stripe.ts:23`).

3. **"Legacy" is a recommendation label on the direct-API subpage, not a deprecation, and it does not appear on the Checkout doc at all** — Stripe defines its own banner ([docs.stripe.com/billing/subscriptions/trials/free-trials](https://docs.stripe.com/billing/subscriptions/trials/free-trials)):
   > "The content below describes a *Legacy* (Technology that's no longer recommended) integration path for offering free trials."
   There is **no sunset date, no removal notice**. Crucially, Stripe *mandates* this same "legacy" mechanism for the entire Checkout product (quote #1) — it would not do that for something being retired.

4. **The Checkout free-trials doc carries zero deprecation and demonstrates `trial_period_days` as the method** — I independently fetched [docs.stripe.com/payments/checkout/free-trials](https://docs.stripe.com/payments/checkout/free-trials) (stripe-hosted variant) and confirmed: the example uses `subscription_data[trial_period_days]`; there is **no** "Legacy" banner, deprecation notice, or "no longer recommended" warning anywhere on that page; and it makes no mention of Trial Offers.

5. **The pinned version does not change this** — Dahlia introduced breaking changes at `2026-03-25.dahlia`; Stripe says subsequent Dahlia versions are additive. The `2026-05-27.dahlia` GA summary contains no Checkout-trial deprecation; the Trial Offer entries are preview/additive and do not deprecate `subscription_data.trial_period_days` or Checkout trials ([Dahlia changelog](https://docs.stripe.com/changelog/dahlia), [Trial Offer price expansion](https://docs.stripe.com/changelog/dahlia/2026-05-27/trial-offer-prices-expansion.md), [Trial Offers on subscription items](https://docs.stripe.com/changelog/dahlia/2026-03-25/trial-offers-on-subscription-items.md)).

**Conclusion (D3):** Adopting the "new" Trial Offer system would mean **abandoning hosted Stripe Checkout** for a custom Subscriptions-API integration, **switching to a preview API version**, and **migrating to flexible billing mode** — a large regression in scope, PCI surface, and stability, to gain advanced-billing features we do not need. We use `subscription_data.trial_period_days`, the documented Checkout path for our architecture. (When we would ever revisit: only if we independently move off hosted Checkout for unrelated reasons — see §B.17.)

## B.3 The decision, with rationale (D1, D2, D4, D5)

- **7 days (D1).** Conversion-by-length benchmarks are nearly flat across 7/14/30 days; length is second-order behind day-0 activation. For an instant-value product bought by deadline-driven exam takers, 7 manufactures useful urgency without measurable trial→paid loss. ([GrowthSpree](https://www.growthspreeofficial.com/blogs/b2b-saas-trial-to-paid-conversion-rate-benchmarks-2026-by-trial-type-acv-length-credit-card), [Outseta](https://www.outseta.com/posts/the-case-for-the-7-day-credit-card-required-free-trial), [Churnkey](https://churnkey.co/blog/convert-more-free-trials-into-paying-customers-with-these-novel-strategies/).)
- **No-card (D2).** End-to-end paying-customers-per-visitor favors no-card at pre-launch because a card wall suppresses trial starts ~70% ([leadsync](https://leadsync.me/blog/ditching-credit-card-requirements-for-free-trials/), [Totango/SEOmoz](https://www.totango.com/blog/seomoz-conversion-isnt-as-great-as-it-seems/)); Chargebee recommends no-card when "seeking product-market fit and user feedback" ([Chargebee](https://www.chargebee.com/blog/saas-free-trial-credit-card-verdict/)). Owner-confirmed.
- **`cancel` end behavior (D4).** It is the value Stripe **demonstrates in code** on the Checkout doc; `pause` is described only in prose and `create_invoice` is absent there (verified in §B.4). `cancel` reuses our existing `customer.subscription.deleted` handling and "subscribe again" flow — the cleanest, best-documented path.
- **Annual default (D5).** The customer's need ends at a fixed exam date → annual matches the horizon; ~51% lower churn, ~2× LTV ([WinSavvy](https://www.winsavvy.com/monthly-vs-annual-subscriptions-conversion-churn-benchmarks/), [Baremetrics](https://baremetrics.com/blog/annual-vs-monthly-pricing-better-retention)). Both plans are trial-able; the annual card already carries the primary emphasis (`border-2 border-primary` at `app/pricing/pricing-view.tsx:161`, and "Save $149 per year" from `lib/pricing-data.ts:29`, rendered at `app/pricing/pricing-view.tsx:171-173`).

## B.4 Stripe mechanics reference (Checkout legacy trials)

**The exact params** added to our existing `params` object (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts:391-424`), when the user is trial-eligible:

- top-level `payment_method_collection: 'if_required'`
- `subscription_data.trial_period_days: 7`
- `subscription_data.trial_settings.end_behavior.missing_payment_method: 'cancel'`

PR-2 also adds adapter-internal top-level Checkout Session metadata `metadata.checkout_variant: 'trial:7'` only on trial sessions. This is not a Stripe trial-behavior parameter; it is the reuse/idempotency fingerprint that prevents a standard Checkout URL from crossing into the trial path (or the reverse) when the same user/plan already has an open Checkout Session. The standard, flag-off path remains byte-identical: no trial params and no checkout-variant metadata.

Verbatim from the Checkout free-trials doc (independently fetched), no-card example:

```curl
-d "subscription_data[trial_period_days]=30" \
-d "subscription_data[trial_settings][end_behavior][missing_payment_method]=cancel" \
-d payment_method_collection=if_required
```

`missing_payment_method` shown **in code: `cancel` only**; **in prose: `cancel` + `pause`**; `create_invoice` is a documented value of the underlying subscription `trial_settings.end_behavior.missing_payment_method` enum but is **not demonstrated or recommended in the hosted Checkout free-trials guide** → we use `cancel`. ([docs.stripe.com/payments/checkout/free-trials](https://docs.stripe.com/payments/checkout/free-trials); [Subscription object — `trial_settings`](https://docs.stripe.com/api/subscriptions/object).)

**Constraints:** `trial_period_days` ≤ 730; mutually exclusive with `trial_end`. ([Billing free-trials](https://docs.stripe.com/billing/subscriptions/trials/free-trials).)

**Webhook flow (all DB-state events already handled — §B.1):**

- No-card start → `checkout.session.completed` → `customer.subscription.created` (trialing → `inTrial` → entitled).
- 3 days before end (day 4 of an unmodified 7-day trial) → `customer.subscription.trial_will_end` (re-syncs; Stripe-native email fires). Stripe can fire this immediately if a trial is ended early or shortened below the 3-day threshold; our 7-day no-card start path does not do that.
- Day 7, no card → `customer.subscription.deleted` (canceled → not entitled → access revoked).
- Convert (card added) → `invoice.payment_succeeded` → `customer.subscription.updated` (trialing → active).

**Status detection:** `trialing`→`inTrial` (in trial); `canceled` (expired, no card). No new statuses. `current_period_end` already read from `items.data[]` and, during a trial, equals `trial_end` (`src/adapters/gateways/stripe/stripe-subscription-normalizer.ts:79-80`).

## B.5 Architecture: Stripe is the single source of truth (D6)

We implement the trial as a real Stripe subscription in `trialing` status, not as an app-managed timer. Rationale: `inTrial` is already an entitled domain status and the webhook already syncs trialing subscriptions, so entitlement, gating, and persistence are **unchanged**. Introducing a separate app-level trial clock would create a second source of truth for "can this user access the app," which is worse. (App-level trial rejected — §B.17.)

## B.6 Convert paths (both decided)

Our checkout use case blocks a *new* Checkout while `inTrial` (`src/domain/value-objects/subscription-status.ts:40-41`), so the two paths are distinct and intentional:

1. **During the trial — add a card early (keep access without interruption).** The in-app trial countdown (§B.8) links to the Stripe Customer Portal via the existing app billing `manageBillingAction` → `createPortalSession` (`app/(app)/app/billing/manage-billing-actions.ts:22-45`, `PaymentGateway.createPortalSession` `src/application/ports/gateways.ts:86-89`). With a card on file at trial end, `missing_payment_method: 'cancel'` does **not** fire (Stripe checks subscription/customer default payment sources to decide whether a payment method is missing), so the subscription converts to `active` normally. **Requires** the Stripe Dashboard Customer Portal to allow payment-method updates (Dashboard config; verify in test mode).
2. **After expiry — re-subscribe (owner's stated model: "enter their card to keep it going").** A lapsed trial is `canceled` (not blocking), so the user goes to `/pricing` and runs the **existing** Checkout flow — now **without** a trial param (they are no longer first-time, §B.9) — enters a card, and becomes `active`. Reuses everything already built.

## B.7 The trial-eligibility gate (D9)

Trial-eligible **iff `subscriptions.findByUserId(userId) === null`** — i.e., the user has no prior subscription record at all. This reuses the lookup already performed at `src/application/use-cases/create-checkout-session.ts:113` and the PR-2 trial computation at `src/application/use-cases/create-checkout-session.ts:131-134`:

- A user who already trialed has a `canceled` (or other) row from the webhook → not eligible → they pay.
- A former paid subscriber has a row → not eligible.
- Only a genuinely new user (no row) gets the trial param.

This needs **no new column**. (Note: for our no-card trial flow, abandoned Checkout Sessions do not create subscription rows — a row appears only after a completed Checkout creates a Stripe subscription and our existing webhooks upsert it — so "no row = first-timer" is reliable for the new flow. Existing paid-flow `paymentProcessing`/`paymentFailed` rows may represent users who attempted payment before this trial launch; those users are intentionally **not** trial-eligible under the conservative "any prior subscription record = no trial" rule, but they can still run the normal paid Checkout when the status is non-blocking.)

## B.8 UI / UX (design-system compliant — `docs/frontend/standards.md`, `.claude/rules/frontend.md`)

All interactive targets use `<Button>`; semantic tokens only; canonical focus ring; any new visual pattern (especially the countdown chip) is added to `docs/frontend/pattern-registry.md` first with light/dark token choices, contrast rationale, and allowed opacity values before implementation.

1. **Pricing CTAs (`app/pricing/pricing-view.tsx`).** When `FREE_TRIAL_ENABLED`, both cards' primary CTA becomes **"Start 7-day free trial"** with subtext "then $29/mo" / "then $199/yr · no card required". Annual stays visually primary. `trialCta`/`postTrialNote` fields live in `lib/pricing-data.ts:12-34` (copy lives there, not in the view); the view only consumes `showTrialCtas` (`app/pricing/pricing-view.tsx:149-158`, `app/pricing/pricing-view.tsx:184-193`).
2. **Banner.** PR-1 already made anonymous → no banner. PR-3 rewords first-timer `subscription_required` to "Start your free trial to access the app — no card required." and uses "Your access ended — choose a plan to continue." for canceled rows because paid-canceled and trial-canceled rows have the same persisted shape (`app/pricing/page.tsx:115-133`).
3. **Checkout success (`app/(marketing)/checkout/success/`).** PR-3 makes the redirect-fallback copy trial-aware: "Your 7-day free trial has started — no charge today" vs the existing paid confirmation, driven off subscription status. Copy seam: `app/(marketing)/checkout/success/page.tsx:37-55`. Status-fetch/sync seam: `app/(marketing)/checkout/success/checkout-success-sync.tsx:197-265`, backed by types in `app/(marketing)/checkout/success/checkout-success-types.ts:74-80` and assertions in `app/(marketing)/checkout/success/checkout-success-assertions.ts:36-96`. The fallback is normally unreachable under Next server `redirect()`; DEBT-412 tracks the separate decision of whether to keep that as fallback-only or replace the immediate redirect with a user-visible interstitial. The in-app countdown is the reliable user-facing trial confirmation today.
4. **In-app trial countdown.** A persistent app-shell indicator "N days left in trial" + an "Add a card to keep access" affordance routes to the billing portal (§B.6 path 1). Days remaining = `trialEndsAt − now`, where `trialEndsAt` is sourced from persisted `currentPeriodEnd` while `status === inTrial` (no Stripe round-trip). PR-3 registers Pattern Registry F-10 and surfaces `trialEndsAt` through `CheckEntitlementOutput` (`src/application/use-cases/check-entitlement.ts:12-24`, `src/application/use-cases/check-entitlement.ts:33-64`), request auth state (`lib/auth-request-cache.ts:15-23`, `lib/auth-request-cache.ts:48-52`), and the app layout (`app/(app)/app/layout.tsx:28-51`, `app/(app)/app/layout.tsx:172-208`).
5. **Ended-access state.** When a no-card trial lapses to `canceled`, the `/app/*` guard redirects to `/pricing`; PR-3 uses trial-neutral copy (**"Your access ended — choose a plan to continue."**) because the no-schema design deliberately does not persist whether a canceled row came from a trial or a paid subscription.

## B.9 Trial abuse / one-trial-per-user

Enforced by D9 (`findByUserId === null`) plus the existing dual blocking-status checks (`src/domain/value-objects/subscription-status.ts:40-41`, `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:21-28`) and the one-Customer-per-user invariant (already maintained in `src/application/use-cases/create-checkout-session.ts:54-107`). Stripe Radar's free-trial-abuse control has little to act on for no-card trials; the Clerk-account requirement to reach the app plus the per-user record is the practical gate.

## B.10 Reminder emails (D8)

v1 enables Stripe's native "trial ending" / "upcoming renewal" customer emails (Stripe Dashboard → Settings → Customer emails / Subscriptions) — Dashboard config, not code. A first-party lifecycle-email sequence (the research's compressed 5-email flow, which drives 30–50% of conversions) requires choosing and integrating an email provider (none exists today) and is **future scope**, filed as a fast-follow on completion — it does not block v1.

## B.11 Edge cases & gotchas (checked against our code)

1. **In-trial user clicks "subscribe" again** → blocked by both layers (correct). Early conversion is via the billing portal (§B.6 path 1), not a second Checkout.
2. **Returning user after a `cancel`ed trial** → `canceled` is not blocking; the normal subscribe flow works; no second trial (D9). Correct.
3. **Period-end source** → already read from `items.data[]` (`src/adapters/gateways/stripe/stripe-subscription-normalizer.ts:79-80`); no top-level `current_period_end` dependency. A regression test pins this.
4. **Webhook ordering / at-least-once** → handlers already idempotent (event-claim + transactional upsert in `src/adapters/controllers/stripe-webhook-controller.ts:101-149`). Unchanged.
5. **CSP `form-action`** → coordinate any new billing form-posts with DEBT-332 so the trial CTA isn't blocked under strict CSP.
6. **Customer Portal must allow payment-method updates** (Dashboard config) for §B.6 path 1; verify in test mode.
7. **Eligibility depends on the completed-trial row existing locally** → the first-time gate is intentionally local (`findByUserId === null`). Existing webhook + checkout-success sync must create that row for every completed trial; if both were lost before a no-card trial later canceled, the local gate could not see the prior Stripe history. Regression-test the sync paths and monitor webhook failures; no schema change is required.
8. **Checkout Session reuse must be variant-safe** → trial and standard Checkout Sessions can share the same user + plan, but not the same Stripe parameters. PR-2 persists `metadata.checkout_variant` on trial Checkout Sessions, scopes fallback/recovery idempotency keys with `:trial:7`, and only reuses an existing open session when both price and checkout variant match. This is required because Stripe idempotency keys reject parameter changes and because the kill-switch path must never reuse an older trial URL.

## B.12 Kill-switch (D10)

`FREE_TRIAL_ENABLED` now exists in `lib/env.ts` following the existing `NEXT_PUBLIC_SKIP_CLERK: z.enum(['true','false']).optional()` pattern (`lib/env.ts:46-47`) and is wired at the composition root (`lib/container/use-cases.ts:61-69`). When off (default in prod until verified): no trial param is passed and CTAs render the current post-PR-1 "Subscribe" copy; anonymous users still get no banner. This is an operational kill-switch, not a product option.

## B.13 Remaining phased implementation plan (small, TDD, CR-clean PRs)

Each remaining PR: tests first (red→green); full local gate before push (`pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`, plus E2E when the billing env is present); fresh CodeRabbit review; **pause for owner grade before merge** (per workflow). Squash-merge to `dev`, fast-forward `main`.

- **Already shipped — PR-1 / Part A (copy):** anonymous visitors no longer see "Subscription required…"; reason-gated banners are preserved. Tests now live in `app/pricing/page.test.tsx:595-614`, `app/pricing/page.test.tsx:932-940`, `app/pricing/page.test.tsx:1052-1060`, and `app/pricing/page.test.tsx:1151-1189`. Independent of Stripe; no remaining implementation work here.
- **Already shipped — PR-2 / Checkout wiring + kill-switch plumbing (`f7463dec`):** `FREE_TRIAL_ENABLED` parsing/defaults (`lib/env.ts:47`; tests `lib/env.test.ts:120-187`); `trialPeriodDays?: number` on `CheckoutSessionInput` (`src/application/ports/gateways.ts:30-37`); use-case first-timer gating (`src/application/use-cases/create-checkout-session.ts:113-154`; tests `src/application/use-cases/create-checkout-session.test.ts:237-312`, `src/application/use-cases/create-checkout-session.test.ts:369-394`); the three no-card Stripe params + trial checkout variant/reuse protection (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts:391-424`; tests `src/adapters/gateways/stripe/stripe-checkout-sessions-trials.test.ts:85-172`); composition-root flag wiring (`lib/container/use-cases.ts:61-69`; test `lib/container.test.ts:475-528`); gated external Stripe test-clock smoke (`tests/integration/stripe-trial-clock-smoke.integration.test.ts:202-270`). No remaining PR-2 implementation work.
- **Already shipped — PR-3 / UI/UX (`3ba5576a`):** trial CTAs + `pricing-data` fields, trial-aware redirect-fallback checkout-success copy, app-shell countdown with Pattern Registry F-10, the entitlement/auth/layout `trialEndsAt` data seam sourced from persisted `currentPeriodEnd`, portal "add a card" affordance via the protected app billing action, validated `FREE_TRIAL_ENABLED` page read, and ended-access copy for canceled rows. Tests live in `app/pricing/page.test.tsx`, `app/pricing/pricing-view.test.tsx`, `app/(marketing)/checkout/success/page.test.ts`, `src/application/use-cases/check-entitlement.test.ts`, `lib/auth-request-cache.test.ts`, `app/(app)/app/layout.test.ts`, and `app/(app)/app/layout-shell.test.tsx`. No remaining PR-3 implementation work; DEBT-412 tracks the checkout-success fallback/product-decision follow-up, and DEBT-413 tracks post-GA flag removal.
- **PR-4 — Config + rollout:** enable `FREE_TRIAL_ENABLED` in the target environment; enable Stripe-native trial emails; configure Customer Portal payment-method updates; E2E for the no-card trial start in `tests/e2e/pricing-*`. Then archive this doc.

## B.14 Acceptance criteria

- [x] Anonymous `/pricing` visitors see no "Subscription required…" banner; reason-gated banners still work (Part A, shipped in PR-1 / `8e2e1489`).
- [ ] A first-time user starts a **7-day, no-card** trial from either plan; the subscription is `trialing` (→ `inTrial` → entitled) and they reach `/app/*` without paying or entering a card.
- [ ] At day 7 with no card, the subscription `cancel`s, access is revoked, and the user lands on a continuation-focused `/pricing`.
- [ ] Adding a card during the trial (via billing portal) converts to `active` at trial end (test-clock proven).
- [x] A user who has trialed (or previously subscribed) is not offered a second trial; the normal paid flow still works for them (PR-2 + PR-3 code/tests shipped; PR-4 adds target-env E2E coverage).
- [x] In-app countdown shows correct days remaining from `trialEndsAt`, sourced from persisted `currentPeriodEnd` during `inTrial`; PR-3 surfaces that value through `CheckEntitlementOutput` → request auth state → app layout.
- [x] No schema migration; no new webhook event types; existing handlers cover all transitions (regression tests green).
- [x] Period-end read from `items.data[]` is regression-pinned.
- [ ] Stripe-native trial-ending email enabled; Customer Portal allows payment-method updates.
- [x] Design-system compliant (Button mandate, tokens, focus ring; Pattern Registry F-10 added for the countdown banner, and Trial CTA Subtext registered).
- [x] `FREE_TRIAL_ENABLED=false` reproduces the current post-PR-1 pay-first behavior exactly.
- [ ] Full local gate green before every push; fresh CodeRabbit clean; owner graded before each merge.

## B.15 Testing plan

- **Unit:** use-case trial gating with existing fakes (`FakeSubscriptionRepository`, `FakeStripeCustomerRepository`, `FakePaymentGateway`, `FakeLogger`); gateway no-card param construction plus trial-vs-standard idempotency/reuse protection; status-map regression; `FREE_TRIAL_ENABLED` parsing/defaults in `lib/env.test.ts` using `tests/shared/process-env.ts`.
- **Integration (test DB):** webhook upsert for trialing/canceled/active; eligibility after a prior record exists; controller/action wiring where persistence is involved.
- **Stripe test clocks (gated external Stripe smoke):** trialing → trial_will_end → canceled (no card); trialing → active (card added). ([Stripe testing](https://docs.stripe.com/billing/testing).)
- **Component/render:** pricing CTAs + banner copy + checkout-success copy + app-shell countdown/expired state using React 19 `renderToStaticMarkup` rules.
- **Browser:** only for async hooks or interactive UI that cannot be verified with static render tests.
- **E2E:** no-card trial start happy path (extend `tests/e2e/pricing-*`).

## B.16 Rollback

Set `FREE_TRIAL_ENABLED=false` → reverts to the current post-PR-1 pay-first behavior (no trial param, no checkout-variant metadata, existing standard checkout idempotency key, existing Subscribe CTAs, anonymous pricing visitors still see no banner). Because there are no schema changes, there is nothing to migrate back. Worst case, a single deploy revert restores the prior UI.

## B.17 Rejected alternatives (decided against, with rationale)

- **Stripe Trial Offers / moving off hosted Checkout (the "new gold standard").** Rejected: explicitly incompatible with Checkout, preview-only API, and requires a flexible-billing migration (§B.2). Adopting it means rebuilding our payment UI and leaving the GA channel — a large regression for features we don't need. Revisit *only* if we independently leave hosted Checkout for unrelated reasons.
- **Card-up-front trial.** Rejected for launch: higher trial→paid % but ~70% fewer trial starts; at pre-launch the bottleneck is starts/feedback, and the owner confirmed the no-card model. (Mechanically it's the smaller change — drop `payment_method_collection`/`trial_settings` — so a future switch is cheap if conversion economics later argue for it.)
- **`pause` end behavior.** Rejected: keeps the subscription resumable but needs a resume path our Checkout flow doesn't have; `cancel` is Stripe's code-demonstrated Checkout value and reuses our existing cancel handling.
- **App-level trial (DB timer, no Stripe subscription until conversion).** Rejected: creates a second source of truth for access; the Stripe-level trial reuses existing entitlement/webhooks (§B.5).
- **14/30-day trial.** Rejected: no conversion gain for an instant-value product; longer trials breed procrastination (§B.3).
- **Freemium / permanent free tier.** Rejected for v1: wrong fit for deadline-driven buyers; would let users camp on free. A soft "reverse-trial floor" (a few free questions/day after expiry) is a possible *future* fast-follow, not v1.

---

## Sources

**Strategy:** [GrowthSpree](https://www.growthspreeofficial.com/blogs/b2b-saas-trial-to-paid-conversion-rate-benchmarks-2026-by-trial-type-acv-length-credit-card) · [Outseta 7-day case](https://www.outseta.com/posts/the-case-for-the-7-day-credit-card-required-free-trial) · [leadsync no-card funnel math](https://leadsync.me/blog/ditching-credit-card-requirements-for-free-trials/) · [Totango/SEOmoz](https://www.totango.com/blog/seomoz-conversion-isnt-as-great-as-it-seems/) · [Chargebee verdict](https://www.chargebee.com/blog/saas-free-trial-credit-card-verdict/) · [WinSavvy monthly-vs-annual](https://www.winsavvy.com/monthly-vs-annual-subscriptions-conversion-churn-benchmarks/) · [Baremetrics annual retention](https://baremetrics.com/blog/annual-vs-monthly-pricing-better-retention) · [Churnkey](https://churnkey.co/blog/convert-more-free-trials-into-paying-customers-with-these-novel-strategies/)

**Stripe (primary, verified — Checkout legacy trials are current; Trial Offers exclude Checkout):** [Checkout free trials](https://docs.stripe.com/payments/checkout/free-trials) · [Billing free trials (the "Legacy" banner)](https://docs.stripe.com/billing/subscriptions/trials/free-trials) · [Trial Offers — Checkout incompatibility + preview/flexible prerequisites](https://docs.stripe.com/billing/subscriptions/trials) · [Subscription object (status enum, items.current_period_*)](https://docs.stripe.com/api/subscriptions/object) · [Mixed interval subscription billing periods (trial end drives current-period end dates)](https://docs.stripe.com/billing/subscriptions/mixed-interval) · [Event types (trial_will_end)](https://docs.stripe.com/api/events/types) · [Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks) · [Testing / test clocks](https://docs.stripe.com/billing/testing) · [Changelog 2026-05-27](https://docs.stripe.com/changelog/dahlia/2026-05-27/trial-offer-prices-expansion.md) · [Changelog 2026-03-25](https://docs.stripe.com/changelog/dahlia/2026-03-25/trial-offers-on-subscription-items.md)
