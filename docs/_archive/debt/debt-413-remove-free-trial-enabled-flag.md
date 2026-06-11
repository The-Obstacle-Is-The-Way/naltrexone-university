# DEBT-413: Remove the `FREE_TRIAL_ENABLED` Flag (rollout scaffolding cleanup)

**Priority:** P3 (flag-lifecycle hygiene; no user impact — removal preserves the verified flag-on behavior)
**Created:** 2026-06-09
**Audit verified:** 2026-06-09 (post-PR-3 merge site inventory); 2026-06-10 (post-PR-4 launch-state consistency audit); 2026-06-10 (post-DEBT-415 E2E flag-on site inventory + first-principles flag-lifecycle correction)
**Status:** ✅ **RESOLVED 2026-06-11 — [PR #418](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/418) (squash `5b6dda87`).** The `FREE_TRIAL_ENABLED` flag is removed everywhere; the trial is now unconditionally on for eligible (first-timer) users. Behavior-neutral: `trialPeriodDays: 7` is granted solely by `subscription === null`; `showTrialCtas` is kept as an eligibility-only prop so canceled / prior-subscriber rows still get standard paid CTAs (the Fable-audit BLOCKING-1 fix); E2E stays trial-on via product behavior, not flag injection; `rg FREE_TRIAL_ENABLED` is zero outside this register. CodeRabbit full review 0-actionable on the exact head `cdd21ec4`; full gate + E2E green; owner-graded. **Owner follow-up:** delete the now-dead `FREE_TRIAL_ENABLED=true` from Vercel envs + local untracked env files (harmless leftover — Zod ignores unknown keys).
**Owner:** Billing / trial rollout.
**Related:** [DEBT-410](./debt-410-free-trial-pathway-and-pricing-access-copy.md) (introduced the flag — decision D10), [Debt Index](../../debt/index.md)

---

## Context

`FREE_TRIAL_ENABLED` was introduced in DEBT-410 (decision **D10**) as a **release / kill-switch toggle**, not a permanent product toggle — the DEBT-410 spec states verbatim that it is "an operational kill-switch, not a product option." Its original job was to de-risk the *launch* of a billing-touching feature: ship the trial code dark (default off), flip it on at the chosen moment (PR-4), and provide a surgical trial-off rollback lever if a launch-only billing defect surfaced. That lever is not a true "instant/no-redeploy" switch in this Vercel app: changing Vercel env requires a redeploy, and Vercel deployment rollback or a code revert is also available.

A release toggle that outlives its rollout is the well-documented **stale-flag anti-pattern** (Fowler / Hodgson, *Feature Toggles*: release toggles are short-lived and should be removed once the feature is fully rolled out). Once trials are GA, verified, and stable, every `FREE_TRIAL_ENABLED` read is a branch that will never be `false` again — permanent complexity and a second mental "lever" for a decision that has already been made.

## Why remove it (owner-decided)

The free trial is the **permanent acquisition strategy**, not an experiment to toggle. The product is **pre-revenue with no current users**, and there is no foreseen operational or product need to turn trials off after launch. Most defects would be fixed forward with the trial left on; the flag only helps the narrow class of launch-only defects where disabling new trials for a short redeploy window is preferable to leaving the issue live. Keeping the lever after verification is uncertain overhead with no offsetting benefit; the owner wants the trial **always on**, and does not want a flag whose existence implies an on/off product question that isn't real.

## Decision (final)

The DEBT-410 trial is launched. Implement a **single small cleanup PR now** that removes the flag entirely and makes the trial unconditionally on for eligible (first-time) users. It is behavior-neutral relative to flag-on production. Merge after the standard gate + CodeRabbit + **owner grade** of the PR; the live payment smoke and the Fable billing bug-hunt run as a deliberate follow-up on the flag-free code, **not** as a precondition:

- Delete `FREE_TRIAL_ENABLED` from the `lib/env.ts` Zod schema (and its `.env.example` entry).
- Remove the flag read at the composition root (`lib/container/use-cases.ts:61-69`).
- Remove the application-layer flag consumer: delete the `freeTrialEnabled` constructor parameter/default (`src/application/use-cases/create-checkout-session.ts:30-37`) and remove `this.freeTrialEnabled &&` from the trial computation (`src/application/use-cases/create-checkout-session.ts:131-134`) so the first-timer trial grant becomes unconditional (still gated by `subscription === null`).
- Remove the page-level flag read in `app/pricing/page.tsx:43-47`; make both pricing-page consumers unconditional for **trial-eligible** state only: trial-forward banner copy (`app/pricing/page.tsx:82-85`, `app/pricing/page.tsx:115-133`, `app/pricing/page.tsx:179-187`) and `showTrialCtas` (`app/pricing/page.tsx:167-199`). Delete the now-unnecessary test injection seam.
- `app/pricing/pricing-view.tsx` does **not** read the flag; it consumes the eligibility-derived `showTrialCtas` prop. Keep that prop and both CTA conditionals because prior subscribers/canceled rows can still render the pricing cards and must see standard paid CTAs. Only remove the stale flag-specific prop comment (`app/pricing/pricing-view.tsx:10-14`).
- Remove now-stale flag comments/copy guards, including only the `lib/pricing-data.ts:18` flag comment; keep the still-true placement rationale in `lib/pricing-data.ts:19-21`.
- Remove the DEBT-415 E2E flag-on scaffolding now made unnecessary by the permanent trial default: the CI E2E step env (`.github/workflows/ci.yml:189-195`), the local orchestrator flag constant (`scripts/e2e-local-orchestrator.ts:35-37`), and the related orchestrator test expectations (`scripts/e2e-local-orchestrator.test.ts:80-130`). E2E should continue to run trial-on because product code is unconditionally trial-on, not because test runners inject the flag.
- Update/delete the now-moot "flag-off byte-identical" tests; retain and, where needed, promote the trial-on behavior tests.
- Update the application use-case tests that currently pass the constructor boolean or pin default-off behavior (`src/application/use-cases/create-checkout-session.test.ts:237-312`, `src/application/use-cases/create-checkout-session.test.ts:369-394`).
- Update the non-literal default-off tests whose expectations change when the default constructor/page path becomes trial-on (`src/application/use-cases/create-checkout-session.test.ts:396-555`, `app/pricing/page.test.tsx:910-966`, `app/pricing/page.test.tsx:1023-1035`, `app/pricing/page.test.tsx:1052-1060`, `app/pricing/page.test.tsx:1151-1189`, `app/pricing/pricing-view.test.tsx:13-69`).
- Update design/docs references that would otherwise break grep-zero: rewrite Pattern Registry "Trial CTA Subtext" to eligibility framing (`docs/frontend/pattern-registry.md:608-622`) and archive/update DEBT-410 together with this cleanup so the active register no longer carries stale flag instructions.
- Remove the now-dead `FREE_TRIAL_ENABLED=true` configuration from Vercel target environments and local untracked env files after the flag-free deploy is live. Unknown env keys are harmless to the app, but leaving them defeats the cleanup goal operationally.
- Grep-confirm **zero** `FREE_TRIAL_ENABLED` references remain anywhere (code, tests, `.env.example`, docs other than this register entry).

Eligibility (one-trial-per-user, first-timer-only via `findByUserId === null`) is **unchanged** — only the global on/off lever is removed. Status-driven UI (e.g. the app-shell countdown keyed on `subscriptionStatus === 'inTrial'`) is already independent of the flag and stays as-is.

## Current Site Inventory (verified 2026-06-10)

| Site | Kind | Removal action |
|---|---|---|
| `.env.example:36-37` | example/config | Delete the optional flag comment and example assignment. |
| `lib/env.ts:47` | declaration | Delete the Zod enum entry. |
| `lib/env.test.ts:120-187` | tests | Delete env parsing/default-off tests for this flag. |
| `lib/container/use-cases.ts:61-69` | read | Remove the boolean argument. |
| `lib/container.test.ts:475-528` | test | Replace with/retain coverage that first-timer checkout receives `trialPeriodDays: 7` without an env flag. |
| `src/application/use-cases/create-checkout-session.ts:30-37,131-134` | flag consumer | Delete the constructor boolean/default and remove `this.freeTrialEnabled &&` so `subscription === null` is the only trial grant gate. |
| `src/application/use-cases/create-checkout-session.test.ts:237-312,369-394` | tests | Remove positional boolean setup, delete the default-off assertion, and retain/promote first-timer + existing-row + blocking-subscription coverage for unconditional trial-on behavior. |
| `src/application/use-cases/create-checkout-session.test.ts:396-555` | literal-free tests | Update exact `checkoutInputs` expectations in first-timer checkout/customer-mapping/concurrent-race tests to include `trialPeriodDays: 7` after the constructor default becomes trial-on. |
| `app/pricing/page.tsx:43-47` | read | Delete `getPricingFeatureFlags()` and validated flag comparison. |
| `app/pricing/page.tsx:82-85,115-133,179-187` | flag-driven banner consumer | Remove the `freeTrialEnabled` side of `PricingTrialContext`/`getPricingBanner`; keep status-based first-timer and canceled-row copy behavior. |
| `app/pricing/page.tsx:167-199,202-307` | flag-driven CTA consumer + render plumbing | Remove the flag side of `showTrialCtas` and delete the feature-flag injection seam; keep `showTrialCtas` as `!pricingData.isEntitled && pricingData.subscriptionStatus === null`, and keep passing that eligibility result to `PricingView`. |
| `app/pricing/page.test.tsx:538-584` | tests | Promote direct banner tests to unconditional trial-on behavior; delete the flag-disabled banner assertion. |
| `app/pricing/page.test.tsx:910-966` | literal-free render tests | Update anonymous/injected render assertions from standard paid CTAs to trial CTAs where the fixture has no subscription row. |
| `app/pricing/page.test.tsx:1023-1035` | fixture drift test | Preserve standard CTAs for `subscription_canceled` by using a canceled subscription-status fixture instead of the current status-null helper. |
| `app/pricing/page.test.tsx:1052-1060` | literal-free render test | Update logged-in first-timer `subscription_required` expectations to trial-forward banner + trial CTAs. |
| `app/pricing/page.test.tsx:1062-1149` | tests | Promote trial-on render tests; delete flag-off/unset parity tests. |
| `app/pricing/page.test.tsx:1151-1189` | query-param render tests | Update the rows whose no-subscription fixtures remain trial-eligible (`subscription_canceled`, `checkout=cancel`, `checkout=error`, `checkout=rate_limited`) to expect trial CTAs; keep `manage_billing` and `payment_processing` rows on the manage-billing card. |
| `app/pricing/pricing-view.tsx:10-14` | prop comment, not a read | Keep `showTrialCtas` and its conditional CTA branches; rewrite the prop comment from flag wording to eligibility wording. |
| `app/pricing/pricing-view.test.tsx:13-69` | tests | Keep coverage for both eligible trial CTA rendering and standard paid CTA rendering; rewrite names/fixtures so they describe eligibility instead of flag-off behavior. |
| `lib/pricing-data.ts:18` | flag comment | Remove the stale flag sentence; keep the plan copy fields and the still-true §B.8.1 placement rationale. |
| `.github/workflows/ci.yml:189-195` | E2E runner env | Delete the E2E-step `FREE_TRIAL_ENABLED` injection; E2E remains trial-on through unconditional product behavior. |
| `scripts/e2e-local-orchestrator.ts:35-37` | local E2E runner env | Delete `FLAG_ON_E2E_ENV` and stop injecting the removed flag into Playwright. |
| `scripts/e2e-local-orchestrator.test.ts:80-130` | tests | Remove expectations that local/CI/deploy-target Playwright steps receive `FREE_TRIAL_ENABLED: 'true'`; retain Docker `DATABASE_URL` behavior coverage. |
| `docs/frontend/pattern-registry.md:608-622` | design doc | Rewrite "Trial CTA Subtext" from flag-on/flag-off language to trial-eligible/standard paid-card eligibility language. |
| `docs/debt/debt-410-free-trial-pathway-and-pricing-access-copy.md` + `docs/debt/index.md` | debt register | Archive DEBT-410 with DEBT-413 or update active references so only the archived historical record mentions the removed flag; keep the active index accurate. |
| Vercel target envs + local env files | config cleanup | Remove `FREE_TRIAL_ENABLED` after the flag-free deploy is live; no secret values should be printed or committed. |

## Constraints

- Removing the flag is behavior-neutral (the trial is already on in production); the live payment smoke + Fable billing bug-hunt are a deliberate follow-up on the flag-free code, **not** a merge gate (owner decision). Standard gate + CodeRabbit + owner grade of the PR still apply.
- Removal must keep flag-**on** behavior byte-identical: the trial that was verified on is what ships permanently.
- Full local gate + billing E2E green; fresh CodeRabbit; owner grade before merge (per workflow).

## Rejected Alternatives

- **Keep the flag permanently.** Rejected: no ongoing operational or product need (trial is the permanent strategy; pre-revenue; no abuse surface yet); it is permanent branch complexity and textbook stale-flag debt.
- **Gate the flag removal on live verification.** Rejected (owner decision): the removal is behavior-neutral relative to flag-on production, the flag is unproductive scaffolding the owner wants off the plate, and bug-finding is independent of the flag — so the live payment smoke + billing bug-hunt run *after* removal, on the flag-free code, rather than blocking the cleanup. The standard gate + CodeRabbit + owner grade still apply to the PR itself.
- **Convert it to a permanent product toggle (e.g. A/B trial vs no-trial).** Rejected: not a current need. If A/B-testing trials ever becomes a goal, that is a new, deliberately-designed experiment flag — not this rollout kill-switch carried forward by inertia.

## Acceptance Criteria

- [ ] `FREE_TRIAL_ENABLED` removed from `lib/env.ts`, every read site, and `.env.example`; grep returns zero references.
- [ ] A first-time user is offered the trial with no env flag set (unconditionally on).
- [ ] Eligibility (one-trial-per-user, first-timer-only) is unchanged.
- [ ] Prior subscribers/canceled rows still see standard paid CTAs, not trial CTAs; `showTrialCtas` remains an eligibility prop, not a deleted/constant view concern.
- [ ] Flag-off code paths and their tests are removed; trial-on behavior remains fully covered.
- [ ] CI and local E2E no longer inject the removed flag; E2E stays trial-on because product behavior is unconditional.
- [ ] Pattern Registry, debt register, Vercel target envs, and local env files no longer carry active `FREE_TRIAL_ENABLED` scaffolding after deploy.
- [ ] Full gate + billing E2E green; CodeRabbit clean; owner-graded.

## Dependencies

- **Owner grade of the PR before merge** (standard workflow). DEBT-410 PR-4 production enablement and DEBT-415 flag-on E2E alignment are complete; the flag is now removable cleanup. The live payment smoke + Fable billing bug-hunt are a planned follow-up on the flag-free code, not a precondition.
