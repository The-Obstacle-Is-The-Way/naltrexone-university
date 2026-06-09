# DEBT-413: Remove `FREE_TRIAL_ENABLED` Flag After Trial GA

**Priority:** P3 (flag-lifecycle hygiene; no user impact — removal happens only after the trial is verified on)
**Created:** 2026-06-09
**Audit verified:** 2026-06-09 (post-PR-3 merge site inventory)
**Status:** **Decided spec — no optionality.** Blocked on DEBT-410 PR-4 (trial must be launched + verified on first).
**Owner:** Billing / trial rollout.
**Related:** [DEBT-410](./debt-410-free-trial-pathway-and-pricing-access-copy.md) (introduced the flag — decision D10), [Debt Index](./index.md)

---

## Context

`FREE_TRIAL_ENABLED` was introduced in DEBT-410 (decision **D10**) as a **release / kill-switch toggle**, not a permanent product toggle — the DEBT-410 spec states verbatim that it is "an operational kill-switch, not a product option." Its only job is to de-risk the *launch* of a billing-touching feature: ship the trial code dark (default off), flip it on at the chosen moment (PR-4), and retain an instant, no-redeploy off-switch if trials misbehave in production (non-conversion, Stripe misconfig, abuse).

A release toggle that outlives its rollout is the well-documented **stale-flag anti-pattern** (Fowler / Hodgson, *Feature Toggles*: release toggles are short-lived and should be removed once the feature is fully rolled out). Once trials are GA, verified, and stable, every `FREE_TRIAL_ENABLED` read is a branch that will never be `false` again — permanent complexity and a second mental "lever" for a decision that has already been made.

## Why remove it (owner-decided)

The free trial is the **permanent acquisition strategy**, not an experiment to toggle. The product is **pre-revenue with no current users**, and there is no foreseen operational or product need to turn trials off after launch. Keeping the lever is uncertain overhead with no offsetting benefit; the owner wants the trial **always on** once verified, and does not want a flag whose existence implies an on/off product question that isn't real.

## Decision (final)

After DEBT-410 **PR-4** sets `FREE_TRIAL_ENABLED=true` in production **and** the trial is verified working end-to-end (a short bake window — at least one real no-card trial observed starting → syncing to `inTrial` → converting or cancelling correctly, with no billing incidents), a **single small cleanup PR removes the flag entirely** and makes the trial unconditionally on for eligible (first-time) users:

- Delete `FREE_TRIAL_ENABLED` from the `lib/env.ts` Zod schema (and its `.env.example` entry).
- Remove the flag read at the composition root (`lib/container/use-cases.ts:61-69`).
- Remove the application-layer flag consumer: delete the `freeTrialEnabled` constructor parameter/default (`src/application/use-cases/create-checkout-session.ts:30-37`) and remove `this.freeTrialEnabled &&` from the trial computation (`src/application/use-cases/create-checkout-session.ts:131-134`) so the first-timer trial grant becomes unconditional (still gated by `subscription === null`).
- Remove the page-level flag read in `app/pricing/page.tsx:43-47`; make both pricing-page consumers unconditional for trial-eligible state: trial-forward banner copy (`app/pricing/page.tsx:82-85`, `app/pricing/page.tsx:115-133`, `app/pricing/page.tsx:179-187`) and `showTrialCtas` (`app/pricing/page.tsx:167-199`). Delete the now-unnecessary test injection seam.
- `app/pricing/pricing-view.tsx` does **not** read the flag; it only consumes the threaded `showTrialCtas` prop. Remove that now-constant prop/conditional UI (`app/pricing/pricing-view.tsx:10-14`, `app/pricing/pricing-view.tsx:149-158`, `app/pricing/pricing-view.tsx:184-193`) so trial CTAs/copy are normal eligible-plan copy.
- Remove now-stale flag comments/copy guards, including the `lib/pricing-data.ts:18-21` comment.
- Update/delete the now-moot "flag-off byte-identical" tests; retain and, where needed, promote the trial-on behavior tests.
- Update the application use-case tests that currently pass the constructor boolean or pin default-off behavior (`src/application/use-cases/create-checkout-session.test.ts:237-312`, `src/application/use-cases/create-checkout-session.test.ts:369-394`).
- Grep-confirm **zero** `FREE_TRIAL_ENABLED` references remain anywhere (code, tests, `.env.example`, docs other than this register entry).

Eligibility (one-trial-per-user, first-timer-only via `findByUserId === null`) is **unchanged** — only the global on/off lever is removed. Status-driven UI (e.g. the app-shell countdown keyed on `subscriptionStatus === 'inTrial'`) is already independent of the flag and stays as-is.

## Current Site Inventory (verified 2026-06-09)

| Site | Kind | Removal action |
|---|---|---|
| `.env.example:36-37` | example/config | Delete the optional flag comment and example assignment. |
| `lib/env.ts:47` | declaration | Delete the Zod enum entry. |
| `lib/env.test.ts:120-187` | tests | Delete env parsing/default-off tests for this flag. |
| `lib/container/use-cases.ts:61-69` | read | Remove the boolean argument. |
| `lib/container.test.ts:475-528` | test | Replace with/retain coverage that first-timer checkout receives `trialPeriodDays: 7` without an env flag. |
| `src/application/use-cases/create-checkout-session.ts:30-37,131-134` | flag consumer | Delete the constructor boolean/default and remove `this.freeTrialEnabled &&` so `subscription === null` is the only trial grant gate. |
| `src/application/use-cases/create-checkout-session.test.ts:237-312,369-394` | tests | Remove positional boolean setup, delete the default-off assertion, and retain/promote first-timer + existing-row + blocking-subscription coverage for unconditional trial-on behavior. |
| `app/pricing/page.tsx:43-47` | read | Delete `getPricingFeatureFlags()` and validated flag comparison. |
| `app/pricing/page.tsx:82-85,115-133,179-187` | flag-driven banner consumer | Remove the `freeTrialEnabled` side of `PricingTrialContext`/`getPricingBanner`; keep status-based first-timer and canceled-row copy behavior. |
| `app/pricing/page.tsx:167-199` | flag-driven CTA consumer | Remove the flag side of `showTrialCtas`; keep eligibility checks. |
| `app/pricing/page.test.tsx:538-584` | tests | Promote direct banner tests to unconditional trial-on behavior; delete the flag-disabled banner assertion. |
| `app/pricing/page.test.tsx:1062-1149` | tests | Promote trial-on render tests; delete flag-off/unset parity tests. |
| `app/pricing/pricing-view.tsx:10-14,149-158,184-193` | prop consumer, not a read | Remove the now-constant `showTrialCtas` prop and conditional copy branches. |
| `app/pricing/pricing-view.test.tsx:35-69` | tests | Update from prop-gated assertions to always-trial eligible-plan assertions. |
| `lib/pricing-data.ts:18-21` | flag comment | Remove the stale comment; keep the plan copy fields if still used. |

## Constraints

- Do **not** remove the flag before PR-4 launch + verification — it earns its keep as instant-off insurance during the exact window (billing rollout) when a bug is most likely and most costly.
- Removal must keep flag-**on** behavior byte-identical: the trial that was verified on is what ships permanently.
- Full local gate + billing E2E green; fresh CodeRabbit; owner grade before merge (per workflow).

## Rejected Alternatives

- **Keep the flag permanently.** Rejected: no ongoing operational or product need (trial is the permanent strategy; pre-revenue; no abuse surface yet); it is permanent branch complexity and textbook stale-flag debt.
- **Remove the flag now, before PR-4 verification.** Rejected: forfeits the no-redeploy off-switch during launch, the riskiest moment for billing code.
- **Convert it to a permanent product toggle (e.g. A/B trial vs no-trial).** Rejected: not a current need. If A/B-testing trials ever becomes a goal, that is a new, deliberately-designed experiment flag — not this rollout kill-switch carried forward by inertia.

## Acceptance Criteria

- [ ] `FREE_TRIAL_ENABLED` removed from `lib/env.ts`, every read site, and `.env.example`; grep returns zero references.
- [ ] A first-time user is offered the trial with no env flag set (unconditionally on).
- [ ] Eligibility (one-trial-per-user, first-timer-only) is unchanged.
- [ ] Flag-off code paths and their tests are removed; trial-on behavior remains fully covered.
- [ ] Full gate + billing E2E green; CodeRabbit clean; owner-graded.

## Dependencies

- **Blocked on DEBT-410 PR-4** (production enablement + verification). This document is the standing reminder so the flag does not silently become permanent.
