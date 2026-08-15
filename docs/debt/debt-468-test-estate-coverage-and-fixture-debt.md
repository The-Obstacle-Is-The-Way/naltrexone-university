# DEBT-468: Test-Estate Coverage Gaps and Shared-Fixture Debt

**Status:** Open
**Priority:** P2
**Date:** 2026-08-14
**Source:** Owner-directed estate-wide investigation (2026-08-14): four parallel read-only sweeps (backend file-presence with indirect-coverage cross-checks; `app/**`+`components/**` lane mapping; E2E/integration flow-surface diff; test-double inventory) plus executed coverage on all three vitest lanes, merged with `istanbul-lib-coverage`. All lanes green during measurement: unit 436 files / 3,853 tests; browser 64 / 398; integration 38+1 skipped / 244+2 skipped; build clean.

---

## Measured baseline (what is NOT the problem)

Merged unit+browser coverage: **93.3% statements / 87.6% branches / 94.8% lines.** By layer: domain services 99.3%, use-cases 95.4%, controllers 95.8%, gateways 95.2%, `app/(app)/app` 94.2% merged (63.8% unit-only — the browser lane carries the hooks, so single-lane numbers understate the app tree by ~30 points; always read the merge). Repositories sit at 83.2% in the unit lane by design and confirm covered in the integration lane (spot receipts: `drizzle-renewal-notice-delivery-repository` 88.2%, `drizzle-renewal-consent-record-repository` 80.0%, `drizzle-tag-repository` 100%, `drizzle-bookmark-repository` 95.0%). All 17 Drizzle repositories have at least one integration suite constructing them against real Postgres. The fakes barrel exports 50 concrete application-layer fakes; their shared implementations have colocated contract coverage except `FakeSha256Hasher`, which is exercised as a collaborator but has no dedicated contract test. The skip census is clean: no `.only`/`.todo`/`.fixme` anywhere; 11 E2E `test.skip` gates are the CI-enforced credential policy; the only other skip is deliberate (below).

Caveat pinned for future readers: `vitest.config.ts` coverage has no `all: true`, so never-imported files are invisible in reports. A three-lane file-presence diff found 10 runtime-emitting `app`/`components`/`lib`/`src` paths absent after type-only files were excluded; those that matter appear in Part 2.

## Part 1 — Egregious flow gaps (highest value, in order)

1. **Trial day 8 is verified by no test that runs on any commit.** The only tests of trial-end transitions (no-card trial cancels; carded trial activates) live in `tests/integration/stripe-trial-clock-smoke.integration.test.ts`, which is `describe.skip`'d behind `RUN_STRIPE_TRIAL_CLOCK_SMOKE=true` + real-key guards (deliberate: it drives live Stripe test clocks; DEBT-410 §B.11). Nothing in CI ever enables it. A 7-day trial is offered to every visitor; day 8 behavior is unverified on every commit. *Fix design:* a scheduled (weekly) GitHub Actions workflow running exactly that smoke against Stripe test mode with the existing env guards, failure-visible; keep it out of the per-PR path (cost, external dependency).
2. **Webhook ingress signature verification is never exercised with a real signature.** `/api/stripe/webhook` and `/api/webhooks/clerk` are `PUBLIC_ROUTE_PATTERNS` entries — Clerk middleware does not protect them; their only lock is the signature check, and both are covered exclusively by unit tests with mocked verifiers, while the controllers behind them are integration-hardened (6 and 2 integration files). The door is untested; the room behind it is armored. *Fix design:* integration tests that construct genuinely signed deliveries — Stripe via `stripe.webhooks.generateTestHeaderString`, Clerk/Svix via the svix signing scheme — and drive the real handler, asserting accept + tamper-reject on each.
3. **The entitlement-loss journey has zero E2E coverage.** `rg 'subscription_required|manage_billing|payment_processing|subscription_canceled' tests/e2e/` → no hits. Global setup subscribes the shared user for most specs; `trial-start.spec.ts` temporarily resets that user to first-timer, but immediately creates a trial and never exercises an unentitled `/app/*` request. The `/app/*` redirect, the four `/pricing?reason=` recovery banners, and Server Actions rejecting a lapsed session are unit-asserted only (`app/(app)/app/layout.test.ts` covers all four branches function-level). A regression that let unentitled users into `/app/*` would pass every test in the repository. *Fix design:* an E2E spec that de-entitles the seeded user (direct DB write, `workers: 1` makes this safe), asserts redirect + reason banner + one Server Action rejection, and restores state in `afterEach` — the exact lifecycle pattern `trial-start.spec.ts` already proves.
4. **The paid-checkout causal chain is never observed end to end, and the annual plan has zero E2E.** Only the monthly no-card trial drives hosted Checkout (`trial-start.spec.ts`). "Already subscribed" states are manufactured by `seedTestSubscription()` writing rows directly, so card → Checkout → `checkout.session.completed` → subscription row → entitlement is stitched together by no test; `rg -i annual tests/e2e/` → nothing. *Fix design:* one card-entry Checkout E2E (Stripe test card on the hosted page, mirroring trial-start's mechanics) asserting the webhook-driven subscription row and app access; run it on the annual price to kill both gaps with one spec. Keys are per-(user, plan, variant), so this consumes a different DEBT-466 idempotency family than trial-start.
5. **The two cron routes mutate production billing unattended and are never executed against real Postgres.** `vercel.json` invokes `/api/cron/reconcile-stripe-subscriptions?dryRun=false&scope=all` and `/api/cron/send-renewal-notices` daily. Both `route.ts` surfaces are unit-tested thoroughly (auth matrix, clamping), and `vercel.test.ts` pins both production URL shapes, but no integration test runs the routes with container wiring against a live DB. *Fix design:* integration tests invoking the route handlers with `Authorization: Bearer` + the exact production URL shapes against the integration DB, asserting end-state rows.

Also flow-adjacent, smaller: `createTrialPaymentMethodSetupSession` is never driven from the UI ("Add a card to keep access" is asserted visible, never clicked — sequence the E2E click-through with the [DEBT-467](./debt-467-trial-setup-checkout-stale-session-url-replay.md) fix so it lands against corrected behavior); `discardPracticeSession` runs only as incidental E2E cleanup, never asserted; `rateQuestion`/`submitQuestionReport` actions and the practice tag/difficulty filter UI have no E2E; `/sign-up` is never submitted (Clerk-rendered form — accepted residual, manual per QA-001 until a Clerk-testing approach is chosen).

## Part 2 — File-level gaps (three-lane composite, verified individually)

**Backend (each cross-checked for indirect coverage before listing):**

- `lib/request-context.ts` — request-correlation seam used by the health and two webhook API routes plus pricing subscribe actions; zero direct test references (it is covered indirectly through those callers).
- `lib/controller-helpers.ts` → `loadAppContainer` — the production react-`cache`d container path incl. the `dbOverride === db` identity check; zero references (its sibling `createDepsResolver` is covered).
- `lib/content/parse-mdx-question.ts` → `canonicalizeMarkdown` / `canonicalJsonString` / `sha256Hex` — content hashing that decides seed sync/skip; no references anywhere (51.2% file coverage; `scripts/seed` is the worst-covered directory at 59.3%).
- `lib/cached-reads.ts` — 51.4% statements / 25% branches.
- `src/adapters/gateways/stripe/stripe-consent-state.ts` — HMAC signing + `timingSafeEqual` verification of consent metadata. The verify side is exercised as an oracle in gateway tests; `createStripeConsentStateSignature` and `stableJsonStringify`'s ordering/array/undefined branches have no direct assertions. Security-adjacent: deserves its own contract test.
- `src/adapters/repositories/question-feedback-row-mappers.ts` — `ApplicationError` throw branches unasserted.
- `src/adapters/repositories/shared/active-exam-visibility.ts` and `shared/latest-attempt-rank-sql.ts` — load-bearing extracted predicates (exam-answer secrecy; bug-235) covered only transitively; each deserves a small contract pin.
- Composition wiring (`lib/container/use-cases.ts` 450 lines, error-classification branching) — exercised via `createContainer` but its Postgres-error→rollback mapping has no direct assertions.

**UI (net genuine gaps after false-alarm elimination):**

- Error-boundary **behavior**: all 12 boundaries are render-asserted, but no boundary test mounts a throwing child, clicks that boundary's "Try again" control to assert `reset`, or asserts the digest-logging effects in `components/error-boundary-page.tsx` — the recovery affordance is unexercised.
- `app/(app)/app/questions/[slug]/question-page-client.tsx` (557) — largest interactive component; its hooks are browser-tested but the DOM-event→hook wiring (6 `onClick`, dialog `onOpenChange`; no `onSubmit` prop exists) is static-only.
- `app/(app)/app/bookmarks/bookmarks-errors.ts` — page tests assert the error-code→copy mapping, but one fallback branch remains uncovered (88.9% branches).
- `app/(app)/app/practice/hooks/use-practice-available-questions-count.ts` (53) — browser coverage reaches every statement and function, but only one side of its binary fallback branch.
- Small: `app/(app)/app/practice/quick/loading.tsx` (absent from the `loading-pages` aggregator — one-line fix), `sign-up-page-client.tsx`'s client-state branches (57.1% statements / 50% branches), and `billing-client.tsx`'s `useFormStatus` pending branch.

**Thin integration suites:** `DrizzleTagRepository` (1 test), `DrizzleBookmarkRepository` (2), and `DrizzleClerkEventRepository`/`DrizzleDeletedClerkUserRepository` (no dedicated contract suites — their idempotency/tombstone semantics are observed only as webhook-suite side effects).

**Mobile viewport:** exactly two 375×667 probes exist (one browser spec, one E2E assertion); the Playwright project matrix is Desktop Chrome only. Adding a mobile device project is the structural fix; QA-002's manual checks remain the interim.

## Part 3 — Shared-fixture debt (quantified)

The doctrine (fakes-over-mocks) is followed at every port — but the estate stops one layer short at the provider boundary, and the duplication concentrates exactly where files are largest (DEBT-469's burn-down list):

| # | Proposal | Location | Replaces | Projected net LOC |
|---|----------|----------|----------|--------:|
| a | **Replay-faithful `FakeStripeCheckoutClient`**: two-map model — responses frozen per idempotency key at first create; `retrieve` reads mutable live state; `markComplete(id)` / `markExpired(id)` drivers; supports `mode: 'setup'` and `'subscription'`. **Hard prerequisite for DEBT-467's red test** (saved-first-response semantics; no existing double can express it — the closest, `createConcurrentStripeMock`, hard-throws on `mode: 'setup'` and cannot transition a session to `complete`) | `src/adapters/gateways/stripe/test-helpers/` (adapter-owned port — cannot live in application fakes) | 7 hand-rolled builders + 8 inline literals across 8 files (~640 LOC, incl. a byte-identical 15-line block in 5 files); 16 files total hand-roll `StripeClient` doubles today (~1,100 LOC) | **≈ −460** |
| b | **Stripe event envelope + subscription-object builder** (`stripeEvent()`, typed shorthands incl. `checkout.session.completed`/`expired`, `stripeSubscriptionObject()`), defaulting from the 5 existing JSON fixtures so provider shape stays authoritative | `tests/shared/stripe-events.ts` | 35 complete literal `evt_…`/type/data envelopes across 3 files + 3 duplicate `createSubscriptionFixture` definitions | **≈ −250** |
| b2 | **`StripeWebhookResult` DTO builder** (application-owned shape) | `src/application/test-helpers/` | 55 `webhookResult` object literals + 36 `subscriptionUpdate` object literals across 18 files + 2 ad-hoc local builders | **≈ −360** |
| c | **Clerk event builder** defaulting from `tests/fixtures/clerk/*.json`; absorbs the local `withEventId` shim | `tests/shared/clerk-events.ts` | 41 inline `user.*` event envelopes across 4 files + 19 `email_addresses` arrays across 2 files (the 1,668-line controller suite contributes 33 and 18) | **≈ −210** |
| d | **`FakeClock`** (`now(): Date` + `nowMs(): number` + `advance`/`advanceTo`) + named instants, exported from the fakes barrel; codify: `vi.setSystemTime` only where production reads the ambient clock | `src/application/test-helpers/fakes/fake-clock.ts` | 4 incompatible time-control patterns: 203 zero-argument Date closures (137 fixed-string, 51 ambient `new Date()`, 15 computed), with the three most-repeated fixed instants recurring ×27/×18/×13; fake-timer overlap; and one file using three mechanisms at once | **≈ −140** |
| e | **View-DTO row factories** (`attemptedQuestionRow()`, `bookmarkRow()`, `sessionHistoryRow()`), promoting the three existing local factories; must follow `fixture-integrity.md` | `src/application/test-helpers/view-rows.ts` | Row construction spans 8 files that directly reference these output types; 3 already define local factories | **≈ −160** |
| f | **`createSubscriptionWriteCandidate`** domain factory, promoting the two local `candidate()` helpers. **Prerequisite for DEBT-465 Part 2** (mutation pilot pins `subscription-write-guard`) | `src/domain/test-helpers/factories.ts` | 23 full candidate-shaped literals and 35 `candidate()` call sites across 2 files; no named `SubscriptionObservation` domain contract exists (webhook observation DTOs belong to b2) | **TBD during extraction** |

The structural censuses touch ~90 files; the five fixture-family projections (with b/b2 split by ownership) total **≈ −1,580 LOC**, while (f) must be sized during extraction. The debt is concentrated in the revenue-critical Stripe/Clerk boundaries (exactly 11,800 lines across the 26 Stripe-named controller/gateway/job test files). Sequencing: (a) before/with DEBT-467; (b)+(b2) with the DEBT-469 splits of the webhook/reconcile suites; (f) before DEBT-465 Part 2; then (d), (e), (c). The Clerk boundary otherwise needs no fake — it is already exemplary (injected functions + subclassed fakes).

Consistency note: ten `*-test-helpers.ts(x)` fixture files live outside any `test-helpers/` directory (e.g., `src/adapters/controllers/practice-controller-test-helpers.ts`), invisible to helper-directory conventions and exclusion filters; fold them into the standard locations while touching their suites.

## Part 4 — Enforcement ratchet

Coverage is uploaded to Codecov with no `codecov.yml` and no vitest `coverage.thresholds`: measured, never enforced. Add per-lane `coverage.thresholds` at just-below-current floors (unit: statements 82 / branches 78; browser and integration pinned the same way after one clean re-measure), ratcheting upward only when a Part here lands — regression-proofing, not target-chasing. Coverage percentage is a byproduct here; assertion strength is DEBT-465's mutation-testing pilot's job. 100% is explicitly not the goal. Activation is gated by [ADR-019](../adr/adr-019-test-quality-practices.md)'s binding observational posture — no metric becomes a CI gate without a new ADR — so the thresholds land only with a dated ADR (or ADR-019 amendment) in the implementing PR; until then coverage stays observational.

## Resolution order (design only — implement after external audit)

1. Part 1 items 2, 3, 5 (signature ingress, entitlement-loss E2E, cron integration) — highest risk-per-effort, no new infrastructure.
2. Part 3 (a) + DEBT-467 implementation; then Part 1 item 4's checkout E2E and the add-card click-through.
3. Part 1 item 1's scheduled trial-clock workflow.
4. Part 2 backend contract tests; Part 2 UI (error-boundary behavior first); thin integration suites.
5. Part 3 (b)/(b2)/(f) interleaved with DEBT-469 splits; then (d)/(e)/(c); Part 4 thresholds last, re-floored.

## Verification

- [ ] Each Part 1 flow has a named spec that fails when its seam is broken (mutation check: revert-the-guard smoke where cheap)
- [ ] Part 2 files each gain direct assertions or a recorded accepted-residual rationale
- [ ] Fixture proposals land with colocated contract tests; replaced hand-rolled sites deleted in the same PRs; `fixture-integrity.md` respected
- [ ] Coverage thresholds active in all three vitest configs; CI red on regression below floors
- [ ] Trial-clock scheduled workflow green at least once against Stripe test mode
- [ ] No new test file exceeds DEBT-469's restored size policy without a reasoned suppression

## Related

- [DEBT-469](./debt-469-toolchain-warning-debt.md) — warning policy + file-size burn-down that these fixtures shrink
- [DEBT-467](./debt-467-trial-setup-checkout-stale-session-url-replay.md) — consumes proposal (a) for its red test
- [DEBT-466](./debt-466-checkout-idempotency-replay-chain-exhaustion.md) — key-family arithmetic constraining new checkout E2Es
- [DEBT-465](./debt-465-test-quality-practices-adoption.md) — mutation pilot consuming proposal (f); QA procedures covering the manual interim
- [DEBT-410](../_archive/debt/debt-410-free-trial-pathway-and-pricing-access-copy.md) §B.11 — the free-trial program whose launch checklist spawned the trial-clock smoke
- [QA-001](../qa/qa-001-practice-core-flows.md) / [QA-002](../qa/qa-002-billing-entitlement.md) — manual coverage of surfaces this item automates over time
