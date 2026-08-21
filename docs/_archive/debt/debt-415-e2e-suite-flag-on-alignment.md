# DEBT-415: Align the E2E Suite With the Flag-On Free-Trial Reality

**Priority:** P3 (test hygiene + missing coverage; the live trial works — this is suite-vs-prod drift, not a product bug)
**Created:** 2026-06-10
**Status:** **Resolved 2026-06-10 — [PR #417](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/417).** Shipped: E2E runs flag-on (scoped to the E2E step only — `ci.yml`; unit/build stay default-off), the stale `pricing-unauthenticated` assertion now expects the trial CTA, and `tests/e2e/trial-start.spec.ts` proves the no-card trial happy path with entitlement asserted at the DB **and** Stripe layers (a first-timer reset cancels subscriptions + detaches cards while preserving the one-customer-per-user mapping). CodeRabbit full review on the exact head `12665b22` (range `42d3b819…12665b22`, 0 actionable); full local gate + E2E 36/36 green; owner-graded before merge.
**Owner:** Engineering.
**Related:** [DEBT-410](./debt-410-free-trial-pathway-and-pricing-access-copy.md) (the trial these tests cover; this was its remaining PR-4 code tail), [DEBT-413](./debt-413-remove-free-trial-enabled-flag.md) (flag removal — will make trial-on unconditional, so the suite must assert trial-on anyway), [Debt Index](../../debt/index.md).

> **Current-coverage supersession (2026-08-20):** [DEBT-471](../../debt/debt-471-e2e-ci-external-fragility.md) removed Stripe-owned DOM from required PR automation after the unchanged test failed on a provider markup change and later passed without a code change. Required `checkout-redirect.spec.ts` now proves the trial CTA through the real Stripe-origin boundary; the former full `trial-start.spec.ts` journey is retained as `stripe-hosted-trial-start.spec.ts` only in a scheduled/manual observational project. The blocking repository-owned Session-shape, eager-sync, persistence, no-card-state, and entitlement contracts remain. This note updates current coverage; it does not rewrite what PR #417 shipped in June.

---

## Problem

The free trial is live in production (`FREE_TRIAL_ENABLED=true`), but the E2E suite still reflects the flag-**off** world, so it is out of sync with the deployed reality:

1. **No trial-start E2E.** DEBT-410 PR-4's one code deliverable — an end-to-end spec for the no-card trial happy path — was never written. The launched flow (pricing trial CTA → hosted Checkout → trialing subscription → app-shell countdown → checkout-success interstitial) has **zero** E2E coverage. Verified: `rg -l trial tests/e2e/` returns nothing.
2. **A stale assertion pins the OLD copy.** `tests/e2e/pricing-unauthenticated.spec.ts:10` asserts the flag-off **`name: 'Subscribe Monthly'`** CTA is visible — which production no longer shows (it renders **"Start 7-day free trial"**, with the conditional at `app/pricing/pricing-view.tsx:149-152`, the literal copy at `lib/pricing-data.ts:22`, and render coverage at `app/pricing/pricing-view.test.tsx:45`). It passes in CI **only because CI does not set `FREE_TRIAL_ENABLED`** (verified: no match in `.github/` → CI runs flag-off), so the suite silently asserts a reality that is no longer live. It fails locally with the flag on and will **hard-break** when DEBT-413 removes the flag (trial-on becomes unconditional).

## Decision (final)

**Make the E2E suite test the flag-ON reality that ships in production**, and add the missing trial-start coverage:

1. **Run E2E with the flag on (mirror prod).** Set `FREE_TRIAL_ENABLED=true` in the E2E environment — the CI workflow **and** the local hermetic runner (`scripts/run-local-e2e.ts`, which already threads an `env` object) — so the suite exercises what production actually serves. This also pre-aligns the suite with DEBT-413, after which trial-on is unconditional.
2. **Fix the stale assertion.** Update `tests/e2e/pricing-unauthenticated.spec.ts` to assert the **trial-forward CTA** ("Start 7-day free trial") for the flag-on / eligible visitor, instead of "Subscribe Monthly."
3. **Add the trial-start E2E** at `tests/e2e/trial-start.spec.ts`: a first-time, no-card user goes pricing → trial CTA → hosted Checkout (Stripe **test mode**) → returns to the checkout-success interstitial ("Your 7-day free trial has started — no charge today", per `app/(marketing)/checkout/success/page.tsx:56`) → reaches `/app/*` with the app-shell countdown ("N days left") + the "Add a card to keep access" affordance. Assert entitlement is granted **without** a card on file.
4. **Decide the flag-off regression's fate.** With the suite flag-on by default, the flag-off "Subscribe Monthly" path is exercised by the colocated unit/component tests (`app/pricing/pricing-view.test.tsx`, `app/pricing/page.test.tsx`), which already cover both branches. Do **not** duplicate that at the E2E layer; the E2E suite mirrors prod (flag-on). When DEBT-413 lands, delete the flag-off unit branches too.

## Constraints

- TDD where it applies; use the hermetic local E2E runner (DEBT-411) + existing seed/auth fixtures.
- Stripe **test mode** only; no live charges; clean up any test-clock / subscription artifacts.
- Full local gate + E2E green before push; fresh CodeRabbit; **owner grade before merge**.
- Do not change product code (this is test coverage) beyond what's strictly needed to make the trial flow E2E-observable (e.g. a `data-testid` if a selector is genuinely missing).

## Rejected alternatives

- **Leave CI flag-off + the stale assertion.** Rejected: the suite asserts a non-live reality (false confidence), fails locally, and hard-breaks at DEBT-413. The point of E2E is to mirror prod.
- **Add the trial E2E but keep CI flag-off.** Rejected: a trial-start spec needs the flag on; running CI flag-off would skip or contradict it, and the stale "Subscribe Monthly" assertion would still lie.
- **Keep a parallel flag-off E2E lane.** Rejected: doubles E2E wall-clock to cover a path the unit/component layer already covers and that DEBT-413 will soon delete.

## Acceptance criteria

- [x] E2E runs with `FREE_TRIAL_ENABLED=true` (CI E2E step + `scripts/run-local-e2e.ts`) — mirroring prod; unit/build stay default-off.
- [x] `tests/e2e/pricing-unauthenticated.spec.ts` asserts the trial-forward CTA ("Start 7-day free trial"), not "Subscribe Monthly."
- [x] `tests/e2e/trial-start.spec.ts` covers: pricing trial CTA → hosted Checkout (test mode) → trialing subscription → checkout-success interstitial → `/app/*` with countdown + add-card affordance; entitlement granted with **no** card.
- [x] Full gate + E2E green; CodeRabbit clean; owner-graded before merge.

## Dependencies

- This is the remaining code tail of DEBT-410 PR-4 (config/rollout already shipped; the trial is live).
- Pairs with DEBT-413 (flag removal) — aligning the suite to flag-on now makes DEBT-413's removal a smaller, cleaner change.
