# DEBT-410: Free-Trial Pathway + Pricing Access-Copy Correction

**Priority:** P1 (acquisition-blocking pre-launch feature; the bundled banner-copy item is P3)
**Created:** 2026-06-06
**Status:** **DECIDED specification — no open options.** Docs-first; no code written yet. Ready for an implementation audit, then phased TDD implementation.
**Author:** Paydown campaign (web research + primary-source Stripe verification + codebase audit).
**Source:** Owner request to (a) repair the "Subscription required to access the app." pricing copy and (b) add a free-trial pathway before dogfooding and first-user acquisition. Owner confirmed the **no-card** model ("try it free; enter a card only to keep going") and asked for a single decided spec with rationale — explicitly *no optionality*.
**Related:** [Debt Index](./index.md), [DEBT-332](./debt-332-security-posture-audit.md) (billing-flow CSP `form-action`), [DEBT-406 archived](../_archive/debt/debt-406-stripe-live-endpoint-version-reconciliation.md) (live webhook endpoint pinned to `2026-05-27.dahlia`); Stripe primary sources cited inline in §B.2–B.4.

---

## 0. Decisions (final)

Every decision below is committed. Rationale follows in the body; rejected alternatives with their reasons are in §B.17. There are no choices left for the reader to make.

| # | Decision | Rationale (short) |
|---|----------|-------------------|
| D1 | **Trial length: 7 days** | Instant-value product + deadline-driven exam buyers; benchmarks show ~no trial→paid loss vs 14 while 7 manufactures urgency and kills procrastination. |
| D2 | **No-card (opt-in) trial; hard wall at expiry** | Pre-launch, the scarce asset is *trial starts* (a card wall cuts them ~70%). Owner-confirmed model: try free, enter a card only to continue. |
| D3 | **Trial mechanism: Stripe Checkout `subscription_data.trial_period_days`** (NOT Trial Offers) | This is Stripe's **only** supported and **currently recommended** way to trial on hosted Checkout. Trial Offers are explicitly incompatible with Checkout and are preview-only. See §B.2 — quote-backed. |
| D4 | **No-card end behavior: `missing_payment_method: 'cancel'`** | The value Stripe **demonstrates in code** for Checkout; cleanest fit — reuses our existing `customer.subscription.deleted` handling and "subscribe again" flow. |
| D5 | **Default plan: Annual ($199/yr) visually primary; both plans trial-able** | Exam need has a fixed end date → annual matches the study horizon; ~51% lower churn, ~2× LTV. |
| D6 | **Architecture: Stripe is the single source of truth (Stripe-level trial)** | `inTrial` is already an entitled domain status; reuses all existing entitlement + webhook code. No parallel app-level trial clock. |
| D7 | **No schema changes** | Eligibility reuses the existing `findByUserId` lookup; the trial countdown reuses the existing `currentPeriodEnd` column (which equals `trial_end` during a trial). Verified — §B.1. |
| D8 | **Trial-reminder emails: Stripe-native trial-ending email** | No app email infrastructure exists (verified). A first-party lifecycle-email system is explicitly future scope (§B.10). |
| D9 | **Eligibility: first-time users only** (`findByUserId === null`) | One trial per user, enforced by the existing per-user subscription record + the existing dual blocking-status checks. |
| D10 | **Kill-switch: `FREE_TRIAL_ENABLED` env flag** | Billing-touching feature → a no-redeploy off-switch, following the existing `NEXT_PUBLIC_SKIP_CLERK` enum-flag precedent. Operational safety, not a product toggle. |
| D11 | **Banner copy:** stop showing "Subscription required…" to anonymous visitors; reword the redirect case to trial-forward | The string is shown to *every* logged-out visitor today and becomes *false* once a trial exists. |

---

## 1. Why this is filed as debt (not just a feature)

Two concrete, present shortcomings — not speculative "could be better":

1. **The pricing surface misrepresents access.** `app/pricing/page.tsx:42-47` returns `reason: 'subscription_required'` whenever there is no signed-in user, and `DeferredPricingView` resolves `effectiveReason = reason ?? pricingData.reason` (`:132-137`), so **every logged-out visitor to `/pricing` sees "Subscription required to access the app."** (`:88-93`, rendered at `app/pricing/pricing-view.tsx:47-81`). That is a blunt, conversion-dampening message on the public marketing surface — and it is *false* the moment a trial exists.
2. **There is no low-friction entry path.** Today the only way in is to pay. For a pre-launch product whose owner's #1 goal is first users + feedback, "pay first, evaluate later" is the single biggest adoption blocker. The domain model was already built to support a trial (`inTrial` is a first-class entitled status — §B.1), so the gap is unfinished MVP scope, i.e. debt.

---

# PART A — Pricing access-copy correction (P3)

## A.1 Current behavior (verified)
- `loadPricingData()` returns `reason: 'subscription_required'` when there is no signed-in user (`app/pricing/page.tsx:41-47`).
- Both render paths compute `effectiveReason = reason ?? pricingData.reason ?? undefined` and pass it to `getPricingBanner` (`:132-137`, `:175-180`).
- `getPricingBanner` maps `subscription_required` → "Subscription required to access the app." (`:88-93`).
- Net: the banner shows for anonymous visitors **and** for signed-in users bounced from `/app/*`. It is not merely a post-redirect affordance.

## A.2 Decision (final)
1. **Anonymous visitors → no "subscription required" banner.** `loadPricingData` returns `reason: null` for logged-out users; the pricing cards and CTAs speak for themselves.
2. **Reword the genuine redirect case** (`subscription_required`) to trial-forward copy: **"Start your free trial to access the app — no card required."** (single source at `app/pricing/page.tsx:88-93`).
3. **Keep** the other reason banners (`manage_billing`, `payment_processing`, `subscription_canceled`) — they are correct and useful.

Part A ships as PR-1 (independent of Stripe) so the public funnel improves immediately.

---

# PART B — Free-trial pathway (P1)

## B.1 Current state — the codebase is already trial-shaped (verified)

The original billing design anticipated trials. Confirmed by reading the code:

| Capability | Where | Status |
|---|---|---|
| Domain status `inTrial` exists and **grants entitlement** | `src/domain/value-objects/subscription-status.ts:10,29-33` | ✅ access works during trial, zero new gating |
| `paused`/`canceled` are not entitled | `:29-33` (absent from `EntitledStatuses`) | ✅ trial expiry correctly revokes access |
| `trialing`/`paused` block a duplicate Checkout (both layers) | `:40-41`; gateway `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:21-28` | ✅ prevents double-trial |
| Stripe↔domain status map incl. `trialing→inTrial`, `paused→paused` | `src/adapters/gateways/stripe/stripe-subscription-status.ts:7-27` | ✅ |
| DB enum includes `trialing` + `paused` | `db/schema.ts:52-62`; table `:177-192` | ✅ no migration needed |
| `customer.subscription.trial_will_end` already routes through the generic path and re-syncs state | schemas `…/stripe-webhook-schemas.ts:74-83`; processor `…/stripe-webhook-processor.ts:114-146`; test `src/adapters/gateways/stripe-payment-gateway.test.ts:593-618` | ✅ already handled (returns a `subscriptionUpdate`) |
| **Normalizer reads period end from `items.data[0].current_period_end`** (the modern location) | `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts:79-80,98` | ✅ no latent bug; **during a trial this equals `trial_end`** → countdown needs no new field |
| **Eligibility gate already present**: the checkout use case looks up `findByUserId` | `src/application/use-cases/create-checkout-session.ts:111` | ✅ `subscription === null` ⇒ first-timer ⇒ grant trial |
| Stripe API pinned `2026-05-27.dahlia` (GA channel), last reviewed 2026-06-04 | `lib/stripe.ts:7,22` | ✅ trial fields valid; not on the preview channel Trial Offers require |

**What is actually missing** (the whole job): we never pass a trial parameter when creating the Checkout Session (`subscription_data` carries only `metadata.user_id`, `stripe-checkout-sessions.ts:307-311`); the pricing/checkout/in-app UI is not trial-aware; and there are no trial-reminder emails (no email infra). That's it. **No schema, webhook, or entitlement changes.**

## B.2 The "legacy" question — settled with primary sources

The owner's question is exactly right to ask: *if Stripe has a newer "gold-standard" trial system, why build on the one Stripe calls "legacy"?* The answer, verified against Stripe's own current docs (and independently re-fetched by me), is decisive: **for a hosted-Checkout product, `subscription_data.trial_period_days` is the current, recommended, and only supported path. The "new" Trial Offer system literally cannot be used with Checkout.** "Legacy" here is a naming label, not a deprecation.

**Evidence (verbatim quotes):**

1. **Trial Offers are explicitly incompatible with Checkout** — Stripe, *Configure trial offers on subscriptions* ([docs.stripe.com/billing/subscriptions/trials](https://docs.stripe.com/billing/subscriptions/trials)):
   > "If you use Checkout, you can't use trial offers. To create trialing subscriptions through Checkout, you must use legacy free trials with `trial_end`. See Configure free trials."

2. **Trial Offers require leaving the GA channel and migrating billing mode** — same page, "Before you begin":
   > "Your integration must be on **2026-03-25.preview**."
   > "You must upgrade your subscription from `classic` billing mode to `flexible` billing mode to use trial offers."
   Our app is pinned to `2026-05-27.dahlia` — the **GA/release** channel, not the preview channel Trial Offers demand (`lib/stripe.ts:7`).

3. **"Legacy" is a recommendation label on the direct-API subpage, not a deprecation, and it does not appear on the Checkout doc at all** — Stripe defines its own banner ([docs.stripe.com/billing/subscriptions/trials/free-trials](https://docs.stripe.com/billing/subscriptions/trials/free-trials)):
   > "The content below describes a *Legacy* (Technology that's no longer recommended) integration path for offering free trials."
   There is **no sunset date, no removal notice**. Crucially, Stripe *mandates* this same "legacy" mechanism for the entire Checkout product (quote #1) — it would not do that for something being retired.

4. **The Checkout free-trials doc carries zero deprecation and demonstrates `trial_period_days` as the method** — I independently fetched [docs.stripe.com/payments/checkout/free-trials](https://docs.stripe.com/payments/checkout/free-trials) (stripe-hosted variant) and confirmed: the example uses `subscription_data[trial_period_days]`; there is **no** "Legacy" banner, deprecation notice, or "no longer recommended" warning anywhere on that page; and it makes no mention of Trial Offers.

5. **The pinned version does not change this** — the only trial-related changelog entries on/after `2026-05-27.dahlia` are *additive* Trial-Offer (preview) features, all non-breaking; none deprecate `trial_period_days` or Checkout trials ([changelog 2026-05-27](https://docs.stripe.com/changelog/dahlia/2026-05-27/trial-offer-prices-expansion.md), [2026-03-25](https://docs.stripe.com/changelog/dahlia/2026-03-25/trial-offers-on-subscription-items.md)).

**Conclusion (D3):** Adopting the "new" Trial Offer system would mean **abandoning hosted Stripe Checkout** for a custom Subscriptions-API integration, **switching to a preview API version**, and **migrating to flexible billing mode** — a large regression in scope, PCI surface, and stability, to gain advanced-billing features we do not need. We use `subscription_data.trial_period_days`. It *is* the gold standard for our architecture. (When we would ever revisit: only if we independently move off hosted Checkout for unrelated reasons — see §B.17.)

## B.3 The decision, with rationale (D1, D2, D4, D5)

- **7 days (D1).** Conversion-by-length benchmarks are nearly flat across 7/14/30 days; length is second-order behind day-0 activation. For an instant-value product bought by deadline-driven exam takers, 7 manufactures useful urgency without measurable trial→paid loss. ([GrowthSpree](https://www.growthspreeofficial.com/blogs/b2b-saas-trial-to-paid-conversion-rate-benchmarks-2026-by-trial-type-acv-length-credit-card), [Outseta](https://www.outseta.com/posts/the-case-for-the-7-day-credit-card-required-free-trial), [Churnkey](https://churnkey.co/blog/convert-more-free-trials-into-paying-customers-with-these-novel-strategies/).)
- **No-card (D2).** End-to-end paying-customers-per-visitor favors no-card at pre-launch because a card wall suppresses trial starts ~70% ([leadsync](https://leadsync.me/blog/ditching-credit-card-requirements-for-free-trials/), [Totango/SEOmoz](https://www.totango.com/blog/seomoz-conversion-isnt-as-great-as-it-seems/)); Chargebee recommends no-card when "seeking product-market fit and user feedback" ([Chargebee](https://www.chargebee.com/blog/saas-free-trial-credit-card-verdict/)). Owner-confirmed.
- **`cancel` end behavior (D4).** It is the value Stripe **demonstrates in code** on the Checkout doc; `pause` is described only in prose and `create_invoice` is absent there (verified in §B.4). `cancel` reuses our existing `customer.subscription.deleted` handling and "subscribe again" flow — the cleanest, best-documented path.
- **Annual default (D5).** The customer's need ends at a fixed exam date → annual matches the horizon; ~51% lower churn, ~2× LTV ([WinSavvy](https://www.winsavvy.com/monthly-vs-annual-subscriptions-conversion-churn-benchmarks/), [Baremetrics](https://baremetrics.com/blog/annual-vs-monthly-pricing-better-retention)). Both plans are trial-able; the annual card already carries the primary emphasis (`border-2 border-primary`, "Save $149 per year", `pricing-view.tsx:151-163`).

## B.4 Stripe mechanics reference (Checkout legacy trials)

**The exact params** added to our existing `params` object (`stripe-checkout-sessions.ts:298-312`), when the user is trial-eligible:
- top-level `payment_method_collection: 'if_required'`
- `subscription_data.trial_period_days: 7`
- `subscription_data.trial_settings.end_behavior.missing_payment_method: 'cancel'`

Verbatim from the Checkout free-trials doc (independently fetched), no-card example:
```
-d "subscription_data[trial_period_days]=30" \
-d "subscription_data[trial_settings][end_behavior][missing_payment_method]=cancel" \
-d payment_method_collection=if_required
```
`missing_payment_method` shown **in code: `cancel` only**; **in prose: `cancel` + `pause`**; `create_invoice` **not present** on the Checkout doc → we use `cancel`. ([docs.stripe.com/payments/checkout/free-trials](https://docs.stripe.com/payments/checkout/free-trials).)

**Constraints:** `trial_period_days` ≤ 730; mutually exclusive with `trial_end`. ([Billing free-trials](https://docs.stripe.com/billing/subscriptions/trials/free-trials).)

**Webhook flow (all DB-state events already handled — §B.1):**
- No-card start → `checkout.session.completed` → `customer.subscription.created` (trialing → `inTrial` → entitled).
- 3 days before end (day 4 of a 7-day trial) → `customer.subscription.trial_will_end` (re-syncs; Stripe-native email fires).
- Day 7, no card → `customer.subscription.deleted` (canceled → not entitled → access revoked).
- Convert (card added) → `invoice.payment_succeeded` → `customer.subscription.updated` (trialing → active).

**Status detection:** `trialing`→`inTrial` (in trial); `canceled` (expired, no card). No new statuses. `current_period_end` already read from `items.data[]` and, during a trial, equals `trial_end` (`stripe-subscription-normalizer.ts:79-80`).

## B.5 Architecture: Stripe is the single source of truth (D6)

We implement the trial as a real Stripe subscription in `trialing` status, not as an app-managed timer. Rationale: `inTrial` is already an entitled domain status and the webhook already syncs trialing subscriptions, so entitlement, gating, and persistence are **unchanged**. Introducing a separate app-level trial clock would create a second source of truth for "can this user access the app," which is worse. (App-level trial rejected — §B.17.)

## B.6 Convert paths (both decided)

Our checkout use case blocks a *new* Checkout while `inTrial` (`subscription-status.ts:40-41`), so the two paths are distinct and intentional:

1. **During the trial — add a card early (keep access without interruption).** The in-app trial countdown (§B.8) links to the Stripe Customer Portal via the existing `manageBillingAction` → `createPortalSession` (`app/pricing/manage-billing-actions.ts`, `PaymentGateway.createPortalSession` `src/application/ports/gateways.ts:85-88`). With a card on file at trial end, `missing_payment_method: 'cancel'` does **not** fire (it only triggers when *no* card exists), so the subscription converts to `active` normally. **Requires** the Stripe Dashboard Customer Portal to allow payment-method updates (Dashboard config; verify in test mode).
2. **After expiry — re-subscribe (owner's stated model: "enter their card to keep it going").** A lapsed trial is `canceled` (not blocking), so the user goes to `/pricing` and runs the **existing** Checkout flow — now **without** a trial param (they are no longer first-time, §B.9) — enters a card, and becomes `active`. Reuses everything already built.

## B.7 The trial-eligibility gate (D9)

Trial-eligible **iff `subscriptions.findByUserId(userId) === null`** — i.e., the user has no prior subscription record at all. This reuses the lookup already performed at `create-checkout-session.ts:111`:
- A user who already trialed has a `canceled` (or other) row from the webhook → not eligible → they pay.
- A former paid subscriber has a row → not eligible.
- Only a genuinely new user (no row) gets the trial param.

This needs **no new column**. (Note: for our no-card flow, abandoned checkouts do not create subscription rows — a row appears only after `customer.subscription.created` — so "no row = first-timer" is reliable. The card-payment `incomplete` edge does not apply to a no-card trial.)

## B.8 UI / UX (design-system compliant — `docs/frontend/standards.md`, `.claude/rules/frontend.md`)

All interactive targets use `<Button>`; semantic tokens only; canonical focus ring; any new visual pattern (e.g., a countdown chip) is added to `pattern-registry.md` first.

1. **Pricing CTAs (`app/pricing/pricing-view.tsx`).** When `FREE_TRIAL_ENABLED`, both cards' primary CTA becomes **"Start 7-day free trial"** with subtext "then $29/mo" / "then $199/yr · no card required". Annual stays visually primary. Add `trialCta`/`postTrialNote` fields to `lib/pricing-data.ts:12-26` (copy lives there, not in the view).
2. **Banner (Part A).** Anonymous → no banner; `subscription_required` reworded to "Start your free trial to access the app — no card required."
3. **Checkout success (`app/(marketing)/checkout/success/`).** Make the copy trial-aware: "Your 7-day free trial has started — no charge today" vs the existing paid confirmation, driven off subscription status. (Copy seam: `checkout-success-assertions.ts` + `page.tsx`.)
4. **In-app trial countdown.** A persistent app-shell indicator "N days left in trial" + an "Add a card to keep access" affordance routing to the billing portal (§B.6 path 1). Days remaining = `currentPeriodEnd − now` while `status === inTrial` (no Stripe round-trip). Register the pattern first.
5. **Expired state.** When a trial has lapsed to `canceled`, the `/app/*` guard already redirects to `/pricing`; reword that reason copy to "Your free trial ended — choose a plan to continue."

## B.9 Trial abuse / one-trial-per-user
Enforced by D9 (`findByUserId === null`) plus the existing dual blocking-status checks (`subscription-status.ts:40-41`, `stripe-checkout-sessions.ts:21-28`) and the one-Customer-per-user invariant (already maintained in `create-checkout-session.ts:52-106`). Stripe Radar's free-trial-abuse control has little to act on for no-card trials; the Clerk-account requirement to reach the app plus the per-user record is the practical gate.

## B.10 Reminder emails (D8)
v1 enables Stripe's native "trial ending" / "upcoming renewal" customer emails (Stripe Dashboard → Settings → Customer emails / Subscriptions) — Dashboard config, not code. A first-party lifecycle-email sequence (the research's compressed 5-email flow, which drives 30–50% of conversions) requires choosing and integrating an email provider (none exists today) and is **future scope**, filed as a fast-follow on completion — it does not block v1.

## B.11 Edge cases & gotchas (checked against our code)
1. **In-trial user clicks "subscribe" again** → blocked by both layers (correct). Early conversion is via the billing portal (§B.6 path 1), not a second Checkout.
2. **Returning user after a `cancel`ed trial** → `canceled` is not blocking; the normal subscribe flow works; no second trial (D9). Correct.
3. **Period-end source** → already read from `items.data[]` (`stripe-subscription-normalizer.ts:79-80`); no top-level `current_period_end` dependency. A regression test pins this.
4. **Webhook ordering / at-least-once** → handlers already idempotent (event-claim + transactional upsert in `stripe-webhook-controller.ts`). Unchanged.
5. **CSP `form-action`** → coordinate any new billing form-posts with DEBT-332 so the trial CTA isn't blocked under strict CSP.
6. **Customer Portal must allow payment-method updates** (Dashboard config) for §B.6 path 1; verify in test mode.

## B.12 Kill-switch (D10)
`FREE_TRIAL_ENABLED` in `lib/env.ts` following the existing `NEXT_PUBLIC_SKIP_CLERK: z.enum(['true','false']).optional()` pattern (`lib/env.ts:46`). When off (default in prod until verified): no trial param is passed and CTAs render today's "Subscribe" copy — behavior is byte-identical to current. This is an operational kill-switch, not a product option.

## B.13 Phased implementation plan (small, TDD, CR-clean PRs)
Each PR: tests first (red→green); full local gate before push (`pnpm typecheck && lint && test --run && test:browser && test:integration && build`, plus E2E when the billing env is present); fresh CodeRabbit review; **pause for owner grade before merge** (per workflow). Squash-merge to `dev`, fast-forward `main`.

- **PR-1 — Part A (copy):** anonymous visitors no longer see "Subscription required…"; reason-gated banners preserved. Pure logic/copy + tests. Independent of Stripe.
- **PR-2 — Checkout wiring:** add `trialPeriodDays?: number` to `CheckoutSessionInput`; in `create-checkout-session.ts` pass `7` only when `subscription === null` and `FREE_TRIAL_ENABLED`; add the three no-card params to the gateway `params` object + extend `CheckoutSessionCreateParams`. Unit (use case + gateway) + integration; **Stripe test-clock** tests for trialing→canceled and trialing→active.
- **PR-3 — UI/UX:** trial CTAs + `pricing-data` fields, trial-aware checkout-success, in-app countdown (register pattern) + portal "add a card" affordance, expired-state copy. Component/browser tests; visual verify light+dark.
- **PR-4 — Config + rollout:** `FREE_TRIAL_ENABLED`; enable Stripe-native trial emails; configure Customer Portal payment-method updates; E2E for the no-card trial start. Then archive this doc.

## B.14 Acceptance criteria
- [ ] Anonymous `/pricing` visitors see no "Subscription required…" banner; reason-gated banners still work (Part A).
- [ ] A first-time user starts a **7-day, no-card** trial from either plan; the subscription is `trialing` (→ `inTrial` → entitled) and they reach `/app/*` without paying or entering a card.
- [ ] At day 7 with no card, the subscription `cancel`s, access is revoked, and the user lands on a trial-aware `/pricing`.
- [ ] Adding a card during the trial (via billing portal) converts to `active` at trial end (test-clock proven).
- [ ] A user who has trialed (or previously subscribed) is not offered a second trial; the normal paid flow still works for them.
- [ ] In-app countdown shows correct days remaining from `currentPeriodEnd` during `inTrial`.
- [ ] No schema migration; no new webhook event types; existing handlers cover all transitions (regression tests green).
- [ ] Period-end read from `items.data[]` is regression-pinned.
- [ ] Stripe-native trial-ending email enabled; Customer Portal allows payment-method updates.
- [ ] Design-system compliant (Button mandate, tokens, focus ring; any new pattern added to `pattern-registry.md`).
- [ ] `FREE_TRIAL_ENABLED=false` reproduces today's behavior exactly.
- [ ] Full local gate green before every push; fresh CodeRabbit clean; owner graded before each merge.

## B.15 Testing plan
- **Unit:** use-case trial gating (fakes; eligible vs ineligible); gateway no-card param construction; status-map regression.
- **Integration (test DB):** webhook upsert for trialing/canceled/active; full trial→cancel→resubscribe cycle; eligibility after a prior record exists.
- **Stripe test clocks:** trialing → trial_will_end → canceled (no card); trialing → active (card added). ([Stripe testing](https://docs.stripe.com/billing/testing).)
- **Browser/component:** pricing CTAs + countdown + expired state (light/dark).
- **E2E:** no-card trial start happy path (extend `tests/e2e/pricing-*`).

## B.16 Rollback
Set `FREE_TRIAL_ENABLED=false` → reverts to today's pay-first behavior (no trial param, original CTAs). Because there are no schema changes, there is nothing to migrate back. Worst case, a single deploy revert restores the prior UI.

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

**Stripe (primary, verified — Checkout legacy trials are current; Trial Offers exclude Checkout):** [Checkout free trials](https://docs.stripe.com/payments/checkout/free-trials) · [Billing free trials (the "Legacy" banner)](https://docs.stripe.com/billing/subscriptions/trials/free-trials) · [Trial Offers — Checkout incompatibility + preview/flexible prerequisites](https://docs.stripe.com/billing/subscriptions/trials) · [Subscription object (status enum, items.current_period_*)](https://docs.stripe.com/api/subscriptions/object) · [Event types (trial_will_end)](https://docs.stripe.com/api/events/types) · [Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks) · [Testing / test clocks](https://docs.stripe.com/billing/testing) · [Changelog 2026-05-27](https://docs.stripe.com/changelog/dahlia/2026-05-27/trial-offer-prices-expansion.md) · [Changelog 2026-03-25](https://docs.stripe.com/changelog/dahlia/2026-03-25/trial-offers-on-subscription-items.md)
