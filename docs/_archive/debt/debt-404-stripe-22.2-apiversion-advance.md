# DEBT-404: Stripe SDK 22.2.0 + API-version advance to 2026-05-27.dahlia

**Priority:** P3 (the split-out `stripe` Dependabot group will emit a 22.1.1 → 22.2.0 bump that fails `typecheck` until the pinned `apiVersion` advances; the change is billing-sensitive and must be delivered as one carefully-verified PR.)
**Created:** 2026-06-04
**Source:** The `stripe` Dependabot group, split out of `npm-minor-and-patch` in PR #396 per the [DEBT-393](./debt-393-dependabot-triage-and-config-hardening.md) precedent. The grouped PR #395 originally red-failed on `stripe` 22.1.1 → 22.2.0 with `lib/stripe.ts(24,5): error TS2322: Type '"2026-04-22.dahlia"' is not assignable to type '"2026-05-27.dahlia"'`. No standalone Dependabot `stripe` PR is open yet; this doc plans a proactive, billing-reviewed manual upgrade.
**Related:** [DEBT-392 Tier 4](./debt-392-dependency-hygiene-audit.md) (the v20 → v22 stripe split precedent — PR #331 bumped the SDK preserving the pin, PR #332 advanced the pin), [DEBT-393](./debt-393-dependabot-triage-and-config-hardening.md) (Dependabot triage; the split protocol), PR #396 (stripe split config), PR #398 (the 7 safe `npm-minor-and-patch` updates that excluded stripe).
**Status:** **Resolved 2026-06-04.** Shipped in **PR #400** (squash-merged to `dev`, `main` fast-forwarded) after the plan passed two independent citation audits and the diff passed an independent billing review (CLEAN). `stripe` is at `^22.2.0`, `STRIPE_API_VERSION` is `2026-05-27.dahlia`, the TS2322 is resolved, the historical webhook fixtures are unchanged, and no type cast was used. CodeRabbit approved the latest head (`dc129cd3`) with no actionable comments. Follow-up [DEBT-405](../../debt/debt-405-stripe-live-endpoint-version-reconciliation.md) tracks the live-endpoint version reconciliation surfaced here.

---

## Problem

The split-out `stripe` group will bump `stripe` 22.1.1 → 22.2.0. `stripe-node` 22.2.0 (released 2026-05-27) **"changes the pinned API version to `2026-05-27.dahlia`"** and types the SDK's `apiVersion` config option to that exact string literal. Our client pins `STRIPE_API_VERSION = '2026-04-22.dahlia'` (`lib/stripe.ts:7`), so 22.2.0 + the old pin fails typecheck:

```text
lib/stripe.ts(24,5): error TS2322:
Type '"2026-04-22.dahlia"' is not assignable to type '"2026-05-27.dahlia"'.
```

(Observed in PR #395's CI before stripe was split out.)

The coupling lives in the **type system**, not at runtime. `stripe-node` will accept any apiVersion string at runtime, so the old pin could be preserved across the SDK bump with a local type assertion (`as Stripe.LatestApiVersion` / `as never`). That is technically possible but not the clean resolution: Stripe's own versioning docs warn that overriding `stripe-node` away from the SDK-pinned version can make TypeScript types inaccurate, and the local DEBT-392 precedent shows the cast was intentionally temporary (PR #331 added it only to preserve the old pin; PR #332 removed it once the pin advanced). The `.claude/rules/fixture-integrity.md` type-discipline rule is path-scoped to tests/test helpers, so it is not a literal global production-code cast ban; it is still the wrong shape here because it would reintroduce a known type-bypass seam instead of aligning the SDK, request version, and generated types. The clean resolution is to **advance the pin to match the SDK**, not to cast around it.

This is **billing-sensitive**: `lib/stripe.ts`'s own policy comment (lines 13–23) mandates reviewing Stripe's API-version changelog for breaking changes and verifying webhooks + checkout flows before any `apiVersion` change.

---

## Findings

### A. The change is non-breaking — confirmed against Stripe's own docs

- **API version (`2026-04-22.dahlia` → `2026-05-27.dahlia`):** Stripe's versioning policy states each monthly Dahlia release is backward-compatible — "you can safely upgrade to a new monthly release without breaking any existing code." The only breaking changes in the Dahlia cycle were the *initial* `2026-03-25.dahlia`, which we are already past (we run `2026-04-22.dahlia`); every subsequent monthly release, including `2026-05-27.dahlia`, is additive-only. Sources: [Stripe API versioning](https://docs.stripe.com/api/versioning), [Dahlia changelog](https://docs.stripe.com/changelog/dahlia).
- **SDK (`stripe-node` 22.1.1 → 22.2.0):** No runtime breaking changes vs 22.1.1 (22.1.1 was two bugfixes; the 22.x line's notable changes were in 22.1.0, which we already shipped). 22.2.0's highlights are new payment methods (bizum/scalapay/twint), `V2.Commerce.ProductCatalogImport`, `billed_until` on `SubscriptionItem`, Verifone reader device types, and `azure_event_grid` — none used by us. Its `⚠️`-marked entries are **TypeScript enum-widening** (e.g. twint `setup_future_usage` literal→enum, added `payment_method_types` members), not runtime breaks; a targeted repo scan finds no `app/`, `lib/`, or `src/` usage of those affected fields/enums. The only `pending_update` hits are subscription event names/fixtures (`customer.subscription.pending_update_applied` / `_expired`), not reads of Stripe's `Subscription.pending_update` payload field. Source: [stripe-node CHANGELOG](https://github.com/stripe/stripe-node/blob/master/CHANGELOG.md).
- **Our consumption is immune to SDK enum widening:** the webhook schema (`stripe-webhook-schemas.ts`) validates subscription `status` as `z.string()` with `.passthrough()`, and the status→domain mapping uses a locally-owned `STRIPE_SUBSCRIPTION_STATUSES` const (`stripe-subscription-status.ts`), not the SDK's status union — so even a widened SDK enum cannot break our typing.

### B. Blast radius — exact edits (verified file:line)

| File:line | Current | Change |
|---|---|---|
| `lib/stripe.ts:7` | `STRIPE_API_VERSION = '2026-04-22.dahlia'` | → `'2026-05-27.dahlia'` |
| `lib/stripe.ts:22` | comment `Last reviewed: 2026-05-24` | → implementation date (2026-06-04) |
| `lib/stripe.ts:24` | `apiVersion: STRIPE_API_VERSION` | no edit (reads the const) |
| `lib/stripe.test.ts:74` | asserts `apiVersion: '2026-04-22.dahlia'` | → `'2026-05-27.dahlia'` |
| `package.json:67` | `"stripe": "^22.1.1"` | → `"^22.2.0"` (+ lockfile resolves 22.2.0) |
| `docs/vendor-docs/stripe.md:3` | **stale**: `^20.3.0` | → `^22.2.0` |
| `docs/vendor-docs/stripe.md:4` | **stale**: `2026-01-28.clover` | → `2026-05-27.dahlia` |
| `docs/vendor-docs/stripe.md:11-16` (API Version History table) | **stale**: lists `2026-01-28.clover` as "Current"; no dahlia rows | → mark clover historical, add the `2026-03-25.dahlia` (BREAKING — Dahlia cutover), `2026-04-22.dahlia`, and `2026-05-27.dahlia` (Current) rows |
| `docs/vendor-docs/index.md:25` | **stale**: `^20.3.0` / `2026-01-28.clover` / `2026-03-17` | → `^22.2.0` / `2026-05-27.dahlia` / `2026-06-04` |
| `.github/dependabot.yml:42-45` | generic split rationale references `STRIPE_API_VERSION` upgrade + billing verification | no edit; remains accurate after the manual upgrade because future Stripe bumps stay billing-sensitive |

> Note: the vendor docs are **already stale** — they were never updated after the v20 → v22 upgrade (DEBT-392). They claim `^20.3.0` / `2026-01-28.clover` while the code runs `^22.1.1` / `2026-04-22.dahlia`. This PR corrects that pre-existing drift while advancing to 22.2.0.

### C. LEAVE — historical webhook fixtures (do NOT touch)

`tests/fixtures/stripe/*.json` (5 files: `customer.subscription.paused/resumed/updated/pending_update_applied/pending_update_expired`) each carry `"api_version": "2026-04-22.dahlia"`. These are **synthetic/historical payload-shape fixtures**, not generated source-of-truth config. The `api_version` field is event metadata, and **no test asserts a fixture's `api_version` against `STRIPE_API_VERSION`** (verified: `rg -n "api_version" app lib src tests --glob '!tests/fixtures/stripe/*.json'` returns no hits). Changing them would add fixture churn without proving an API-shape change. Leave them unless intentionally regenerating/rebaselining the webhook fixture set against the new version (out of scope here).

### D. Consumers the pin touches — verification surface

The fixtures + Stripe client flow through: `lib/stripe.ts` (lazy client), `stripe-payment-gateway` (checkout session create/reuse), `stripe-webhook-processor` + `stripe-subscription-normalizer` + `stripe-webhook-schemas` (event parsing/validation), `stripe-webhook-controller` (HTTP boundary), and `reconcile-stripe-subscriptions` (job). Each has a unit suite consuming the fixtures; `tests/integration/controllers.integration.test.ts` covers the integration path.

---

## Delivery shape — single coupled PR (deviates from DEBT-392's two-PR split, with cause)

DEBT-392 Tier 4 split the SDK bump (PR A) from the pin advance (PR B) for v20 → v22. But that bump hit the **same** type narrowing we face now: PR #331 only kept the old pin by adding a type cast (`'2026-01-28.clover' as StripeApiVersion`), which PR #332 then *removed* when it advanced to a clean literal (`2026-04-22.dahlia`). Repeating that pattern would knowingly ship an inaccurate-type window for no practical benefit: both the SDK delta and the API-version delta are non-breaking (Finding A), and the next implementation can resolve TS2322 cleanly by aligning the SDK and pin in one change. The correct shape is **one manual PR** that bumps the SDK, advances the pin, updates the assertion, and corrects the vendor docs together.

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

## Related debt / follow-ups (surfaced while scoping — not fixed here)

- **Live webhook endpoint API-version drift (dashboard-side, out of repo scope).** Per [DEBT-384](./debt-384-stripe-webhook-error-rate-investigation.md), the *live* Stripe webhook endpoint is pinned in the Dashboard to `2026-01-28.clover` while the SDK client pin (repo code) is `2026-04-22.dahlia` — and this PR advances the client to `2026-05-27.dahlia`, *widening* that gap. Reconciling the live endpoint version is a billing-ops task outside this PR's repo-code scope; Stripe's versioning docs confirm webhook endpoints can have their own API version. DEBT-384 closed its missing-event config but never reconciled the endpoint version. Track this as a **separate follow-up: DEBT-405** (the current `docs/debt/index.md` next ID).
- **Webhook fixture regeneration (optional, deferred).** The `tests/fixtures/stripe/*.json` remain `2026-04-22.dahlia` synthetic/historical payload fixtures (correct to LEAVE — Finding C). Regenerating them against `2026-05-27.dahlia` is only warranted if a future Dahlia release changes a field we parse; none currently does.
- **Archived historical Stripe-version references (LEAVE).** `docs/_archive/**` and archived bug/debt records still mention earlier Clover/Dahlia versions as historical snapshots. They are not implementation inputs for DEBT-404 and should not be rewritten.

---

## Acceptance criteria

- [x] `stripe` `^22.2.0` in `package.json` + lockfile; `pnpm install --frozen-lockfile` clean.
- [x] `STRIPE_API_VERSION = '2026-05-27.dahlia'`; `lib/stripe.ts` review-date comment updated; `lib/stripe.test.ts:74` assertion updated; `pnpm typecheck` green (TS2322 gone).
- [x] Vendor docs corrected to `^22.2.0` / `2026-05-27.dahlia` / Last Verified 2026-06-04 (fixes the pre-existing v20 drift).
- [x] Webhook fixtures unchanged; full unit + integration stripe suites green.
- [x] Full gate green; E2E green or explicitly skipped with reason.
- [x] Billing-reviewed.
- [ ] CodeRabbit-clean; merged; `main` fast-forwarded to `dev`.
