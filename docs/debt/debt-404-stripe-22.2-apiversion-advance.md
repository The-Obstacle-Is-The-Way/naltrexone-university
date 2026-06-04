# DEBT-404: Stripe SDK 22.2.0 + API-version advance to 2026-05-27.dahlia

**Priority:** P3 (the split-out `stripe` Dependabot group will emit a 22.1.1 → 22.2.0 bump that fails `typecheck` until the pinned `apiVersion` advances; the change is billing-sensitive and must be delivered as one carefully-verified PR.)
**Created:** 2026-06-04
**Source:** The `stripe` Dependabot group, split out of `npm-minor-and-patch` in PR #396 per the [DEBT-393](../_archive/debt/debt-393-dependabot-triage-and-config-hardening.md) precedent. The grouped PR #395 originally red-failed on `stripe` 22.1.1 → 22.2.0 with `lib/stripe.ts(24,5): error TS2322: Type '"2026-04-22.dahlia"' is not assignable to type '"2026-05-27.dahlia"'`. No standalone Dependabot `stripe` PR is open yet; this doc plans a proactive, billing-reviewed manual upgrade.
**Related:** [DEBT-392 Tier 4](../_archive/debt/debt-392-dependency-hygiene-audit.md) (the v20 → v22 stripe split precedent — PR #331 bumped the SDK preserving the pin, PR #332 advanced the pin), [DEBT-393](../_archive/debt/debt-393-dependabot-triage-and-config-hardening.md) (Dependabot triage; the split protocol), PR #396 (stripe split config), PR #398 (the 7 safe `npm-minor-and-patch` updates that excluded stripe).
**Status:** Open — plan written 2026-06-04; pending independent citation audit + user grade, then implementation on `debt/404-stripe-apiversion-advance`.

---

## Problem

The split-out `stripe` group will bump `stripe` 22.1.1 → 22.2.0. `stripe-node` 22.2.0 (released 2026-05-27) **"changes the pinned API version to `2026-05-27.dahlia`"** and types the SDK's `apiVersion` config option to that exact string literal. Our client pins `STRIPE_API_VERSION = '2026-04-22.dahlia'` (`lib/stripe.ts:7`), so 22.2.0 + the old pin fails typecheck:

```
lib/stripe.ts(24,5): error TS2322:
Type '"2026-04-22.dahlia"' is not assignable to type '"2026-05-27.dahlia"'.
```

(Observed in PR #395's CI before stripe was split out.)

The coupling lives in the **type system**, not at runtime. `stripe-node` will accept any apiVersion string at runtime, so the old pin could be preserved across the SDK bump with a type assertion (`as Stripe.LatestApiVersion` / `as never`). **This repo forbids that** — `as any` / `as unknown as` / `@ts-ignore` are banned by `.claude/rules/fixture-integrity.md` ("Type discipline"), and DEBT-402 deliberately removed the last such casts. So the clean resolution is to **advance the pin to match the SDK**, not to cast around it.

This is **billing-sensitive**: `lib/stripe.ts`'s own policy comment (lines 13–23) mandates reviewing Stripe's API-version changelog for breaking changes and verifying webhooks + checkout flows before any `apiVersion` change.

---

## Findings

### A. The change is non-breaking — confirmed against Stripe's own docs

- **API version (`2026-04-22.dahlia` → `2026-05-27.dahlia`):** Stripe's versioning policy states each monthly Dahlia release is backward-compatible — "you can safely upgrade to a new monthly release without breaking any existing code." `2026-05-27.dahlia` is additive (adds Scalapay, Bizum, recurring Twint, flexible connected-account payout timing, programmatic Financial Account transfers, and subscription billing schedules — **none of which we use**). The only breaking changes in the Dahlia cycle were the *initial* `2026-03-25.dahlia`, which we are already past (we run `2026-04-22.dahlia`). Sources: [Stripe API versioning](https://docs.stripe.com/api/versioning), [Dahlia changelog](https://docs.stripe.com/changelog/dahlia).
- **SDK (`stripe-node` 22.1.1 → 22.2.0):** No breaking changes — 22.2.0 is additive (bizum/scalapay support, V2 list types, enhancements). The 22.x line's breaking changes were in 22.1.0, which we already shipped (we run 22.1.1). Source: [stripe-node CHANGELOG](https://github.com/stripe/stripe-node/blob/master/CHANGELOG.md).

### B. Blast radius — exact edits (verified file:line)

| File:line | Current | Change |
|---|---|---|
| `lib/stripe.ts:7` | `STRIPE_API_VERSION = '2026-04-22.dahlia'` | → `'2026-05-27.dahlia'` |
| `lib/stripe.ts:22` | comment `Last reviewed: 2026-05-24` | → implementation date (2026-06-04) |
| `lib/stripe.ts:24` | `apiVersion: STRIPE_API_VERSION` | no edit (reads the const) |
| `lib/stripe.test.ts:74` | asserts `apiVersion: '2026-04-22.dahlia'` | → `'2026-05-27.dahlia'` |
| `package.json:67` | `"stripe": "^22.1.1"` | → `"^22.2.0"` (+ lockfile resolves 22.2.0) |
| `docs/vendor-docs/stripe.md:3` | **stale**: `^20.3.0` / `2026-01-28.clover` | → `^22.2.0` / `2026-05-27.dahlia` |
| `docs/vendor-docs/index.md:25` | **stale**: `^20.3.0` / `2026-01-28.clover` / `2026-03-17` | → `^22.2.0` / `2026-05-27.dahlia` / `2026-06-04` |

> Note: the vendor docs are **already stale** — they were never updated after the v20 → v22 upgrade (DEBT-392). They claim `^20.3.0` / `2026-01-28.clover` while the code runs `^22.1.1` / `2026-04-22.dahlia`. This PR corrects that pre-existing drift while advancing to 22.2.0.

### C. LEAVE — historical webhook fixtures (do NOT touch)

`tests/fixtures/stripe/*.json` (5 files: `customer.subscription.paused/resumed/updated/pending_update_applied/pending_update_expired`) each carry `"api_version": "2026-04-22.dahlia"`. These are **captured event payloads** — the `api_version` field records the version Stripe used when the event was rendered, not our config pin. **No test asserts a fixture's `api_version` against `STRIPE_API_VERSION`** (verified: the only `api_version` references outside the fixtures are in docs, not test code). Changing them would falsify the fixtures. Leave them unless intentionally regenerating against the new version (out of scope here).

### D. Consumers the pin touches — verification surface

The fixtures + Stripe client flow through: `lib/stripe.ts` (lazy client), `stripe-payment-gateway` (checkout session create/reuse), `stripe-webhook-processor` + `stripe-subscription-normalizer` + `stripe-webhook-schemas` (event parsing/validation), `stripe-webhook-controller` (HTTP boundary), and `reconcile-stripe-subscriptions` (job). Each has a unit suite consuming the fixtures; `tests/integration/controllers.integration.test.ts` covers the integration path.

---

## Delivery shape — single coupled PR (deviates from DEBT-392's two-PR split, with cause)

DEBT-392 Tier 4 split the SDK bump (PR A, *preserving* the pin) from the pin advance (PR B). That worked for v20 → v22 because the pin could be preserved across the SDK bump. **It cannot here**: 22.2.0's type forces `2026-05-27.dahlia`, and preserving the old pin would require a banned type cast. Since both the SDK delta and the API-version delta are non-breaking (Finding A), the correct shape is **one manual PR** that bumps the SDK, advances the pin, updates the assertion, and corrects the vendor docs together.

- **Manual**, off current `dev` — not on a Dependabot branch (DEBT-393). If a Dependabot `stripe` PR opens before this lands, close it as superseded.

---

## Verification plan

- `pnpm typecheck` — must pass (resolving the TS2322 is the core of the change).
- **Unit:** `lib/stripe.test.ts` + the consumer suites in (D) — `stripe-payment-gateway`, `stripe-webhook-processor`, `stripe-subscription-normalizer`, `stripe-webhook-controller`, `reconcile-stripe-subscriptions`.
- **Integration:** `tests/integration/controllers.integration.test.ts` (webhook path) against the local test DB (`pnpm db:test:up` + migrate + seed).
- `pnpm install --frozen-lockfile` — clean (supply-chain gate: `stripe@22.2.0` published 2026-05-27, clears `minimumReleaseAge: 10080`).
- **Full gate** under Node 24: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`.
- **E2E:** checkout + billing flows (`pnpm test:e2e`) if the local authenticated Stripe/Clerk env is present (per CLAUDE.md billing-E2E prereqs); otherwise state explicitly that E2E was skipped and rely on unit + integration coverage.
- **Billing review** of the diff before implementation (this doc) and again before merge (per the `lib/stripe.ts` policy comment).

---

## Acceptance criteria

- [ ] `stripe` `^22.2.0` in `package.json` + lockfile; `pnpm install --frozen-lockfile` clean.
- [ ] `STRIPE_API_VERSION = '2026-05-27.dahlia'`; `lib/stripe.ts` review-date comment updated; `lib/stripe.test.ts:74` assertion updated; `pnpm typecheck` green (TS2322 gone).
- [ ] Vendor docs corrected to `^22.2.0` / `2026-05-27.dahlia` / Last Verified 2026-06-04 (fixes the pre-existing v20 drift).
- [ ] Webhook fixtures unchanged; full unit + integration stripe suites green.
- [ ] Full gate green; E2E green or explicitly skipped with reason.
- [ ] CodeRabbit-clean; billing-reviewed; merged; `main` fast-forwarded to `dev`.
