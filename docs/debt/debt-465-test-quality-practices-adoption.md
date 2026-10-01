# DEBT-465: Advanced Test-Quality Practices Adoption (CRAP Report, Mutation Testing, Acceptance Tests, UI QA Procedures)

**Status:** Open
**Priority:** P2
**Date:** 2026-08-13
**Source:** [ADR-019](../adr/adr-019-test-quality-practices.md) (Proposed) + the 2026-08-13 audit of the test estate
**Scope:** Execution of the four practices ADR-019 proposes to adopt. The runbooks are written and canonical; this item tracks the *work* — script, pilot, harness, and register activation. Owner-initiated waves; nothing here is a shortcut in shipped code.

---

## Description

**2026-09-21 audit forward pointer.** Part 1 is shipped: `package.json` exposes `quality:crap`, and the reporter requires all three Istanbul inputs. The top-25 table below is the **2026-08-22 baseline**, not a fresh measurement of today's tree. The opening 556-file census and “no ranked report” observation are likewise filing history. Part 2's pilot and second wave shipped on 2026-09-27 (below); widening to `src/domain/**` and the application layer remains. Parts 3–4 remain unimplemented: no acceptance directory exists, and QA-001/QA-002 both remain Draft without their required two complete evidenced runs. ADR-019 still requires a new ADR before a metric gates CI. The existing entitlement-loss E2E means that particular item in the older QA-gap inventory is no longer absent. [Current-tree audit and limits](./assets/active-audit-2026-09-21/verification.md).

The suite ADR-003 built is broad (556 test files, ~151k lines, four lanes) but nothing audits or specifies it from the outside. The audit made the gap concrete:

- `src/domain/services/grading.ts` — the product's core correctness function — has 5 tests; `subscription-write-guard.ts`, which decides whether a paying customer's stored subscription may be overwritten, has 21 table-driven cases nothing has ever audited for bite. No tool measures whether any of those tests would catch a flipped boundary.
- `src/adapters/repositories/drizzle-renewal-notice-delivery-repository.ts` (legally-required notice delivery state machine, 399 loc) has zero direct repository unit tests; its behavior is covered in integration, but no ranked report surfaces such spots.
- Business rules exist only as code + unit tests; there is no UI-independent executable specification, so nothing structurally stops a rule from migrating into a component during agent iteration.
- A long list of UI surfaces has route-level automation gaps — enumerated in `docs/dev/qa-procedures.md` (rendered Clerk auth forms, forced route-boundary states, billing-portal round-trip, the `/app/*` entitlement redirect gate, an app-wide mobile sweep) — and the operator checklist's "smoke-tested" item has no Active procedure linked behind it.

## Impact

Agent-heavy development amplifies each gap: green suites that don't constrain behavior admit regressions; unspecified rules bleed into the UI layer; API-correct/UI-broken deliveries pass every gate. Triage of "what to test or refactor next" stays manual and unranked.

## Resolution

Four parts. Each part's step-by-step lives in its runbook (canonical); this doc tracks completion. Recommended order 1 → 2 → 3, with Part 4 proceeding in parallel; metrics stay observational per ADR-019's binding posture.

### Part 1 — CRAP report script

`docs/dev/code-quality-metrics.md` §5. TDD `scripts/crap-report.ts` (the TS6 compiler API behind the DEBT-460 alias + all three required Istanbul coverage maps), add `quality:crap` plus direct `istanbul-lib-coverage` and `@types/istanbul-lib-coverage` devDependencies, produce the merged-lane baseline, and reconcile the a-priori hotspot table against measured ranking. Metric outcomes always exit 0; only missing/malformed inputs, parse/I/O failures, or invalid CLI configuration exit nonzero.

### Part 2 — Mutation-testing pilot

`docs/dev/mutation-testing.md`. Install `@stryker-mutator/core` + `@stryker-mutator/vitest-runner`, land `stryker.config.json` with the 8 pinned pilot targets (`subscription-write-guard`, `entitlement`, `grading`, `exam-timer`, `statistics`, `shuffle` + `shuffled-choice-views` counted as one combined target, `persist-subscription-observation`, `validate-feedback-context` — nine files, eight targets; the config and verification checklist must use this same count), run the baseline, triage every survivor (missing test / equivalent-suppress-with-reason / dead code / wrong-lane / no-coverage descope), then widen to `src/domain/**` and add the weekly scheduled workflow. `typescript-checker` stays deferred behind the DEBT-460 TS6/TS7 seam.

**2026-09-27:** the pilot shipped. The dependencies, `stryker.config.json`, `pnpm test:mutation` and the weekly workflow landed, and every baseline survivor is triaged (below). The second wave followed the same day. Widening remains.

### Part 3 — Acceptance-test harness

`docs/dev/acceptance-testing.md` §8. Install `@amiceli/vitest-cucumber`, build `tests/acceptance/support/application-driver.ts` verb-by-verb, land features #1 and #4 (session-start conflict; tutor/exam feedback split), then #2/#3/#10 (entitlement + trial). Update the Test Locations tables (`AGENTS.md`, `.claude/rules/testing.md`) in the first feature's PR. From then on new business rules ship their feature file first.

### Part 4 — UI QA register activation

`docs/dev/qa-procedures.md` + `docs/qa/index.md`. Execute QA-001 and QA-002 twice each — complete end-to-end runs, in modes able to perform every step including the `⚠ human/PW` ones, per `docs/dev/qa-procedures.md`'s two-evidenced-runs gate — promote them Draft → Active with evidence in `docs/qa/assets/`, then file the backlog procedures (sign-up/first-run, error/404/loading, mobile sweep, a11y sweep, account-deletion-with-disposable-account, …) as they're needed by real PRs. Wire the per-PR "touched-surface procedure + screenshots" habit into review expectations.

## Verification

- [x] Part 1: `scripts/crap-report.ts` + colocated test landed; baseline top-25 recorded below; hotspot table reconciled
- [x] Part 2 pilot: baseline and after-triage scores recorded below; zero un-triaged survivors in the nine pilot files (2026-09-27)
- [x] Part 2 weekly workflow live: `.github/workflows/mutation.yml` reached `main` through #1160; a dispatched run on `main` at `f036da70` ([36344618005](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/36344618005), 19:30:51Z–19:37:07Z) instrumented 13 files with 463 mutants and scored 100% (454 killed, 3 timed out, 6 suppressed), matching the local runs, and uploaded its `mutation-report` artifact. Mondays at 06:00 UTC from then on.
- [x] Part 2 second wave: the runbook §4 second-wave files, baseline and after-triage scores recorded below (2026-09-27)
- [ ] Part 2 widening: production files across `src/domain/**` (**done 2026-09-30**, third wave below), then `src/application/{use-cases,shared}/**` (`shared` **done 2026-09-30**, wave 4a below; `use-cases`: eight of 39 in scope after wave 4b on 2026-10-01, below; 31 remain)
- [ ] Part 3: driver + features #1/#4 landed with spec-sync verified (rename-a-step fails); revenue features #2/#3/#10 landed; location tables updated
- [ ] Part 4: QA-001 and QA-002 Active with evidence; operator-checklist item 8 references the register
- [ ] Standing: no numeric gate introduced anywhere without a new ADR (ADR-019 Compliance)

### Baselines (fill on first runs — no invented numbers)

| Measure | Date | Result |
|---|---|---|
| CRAP top-25 snapshot | 2026-08-22 | Required three-lane merged baseline (unit + browser + integration): 445 files / 2,177 functions; 6 scores ≥30, none >100; highest `QuestionView` at 84.00. Full measured snapshot below. |
| Mutation second wave | 2026-09-27 | Four files: baseline 91.44% (187 mutants), after triage 100.00% (168), no suppression. Triage below. |
| Mutation third wave | 2026-09-30 | Every other production file under `src/domain/**`, by glob: 21 with mutants. Baseline 87.25% (267 killed, 39 survived, of 306). After triage 100.00% (295 killed, 1 timed out, of 296 scored; 6 suppressed). The full weekly scope then scored 100.00% (763 killed, 26 timed out, 12 suppressed) in 6 min 6 s. Triage below. |
| Mutation wave 4a | 2026-09-30 | The rest of `src/application/shared/**`, by glob: eight files. Baseline 94.85% (216 killed, 5 timed out, 11 survived and 1 without coverage, of 233). After triage 100.00% (230 killed, 2 timed out, of 232; 1 suppressed). The full weekly scope then scored 100.00% (993 killed, 28 timed out, 13 suppressed) in 7 min 9 s. Triage below. |
| Mutation wave 4b | 2026-10-01 | Six small use cases, by name. Baseline 80.85% (76 killed, 13 survived and 5 without coverage, of 94). After triage 100.00% (92 killed, of 92; 2 suppressed). The full weekly scope, run without the incremental cache, then scored 100.00% (1,087 killed, 22 timed out, 19 suppressed) in 5 min 41 s. Triage below. |
| Mutation pilot scores | 2026-09-27 | Stryker 9.6.1, unit lane, nine files. Baseline 91.77%: 286 killed, 4 timed out, 24 survived and 2 without coverage, of 316 mutants. After triage 100.00%: 286 killed and 3 timed out, of 289 scored; 6 more are suppressed. Both are full `--force` runs. Per-file scores are in the runbook's §7; the triage is below. |

### Part 2 mutation pilot triage — 2026-09-27

Every one of the 26 undetected baseline mutants was classified under the runbook's §5. The instrumented count fell from 316 to 295, mostly because deleted code carries no mutants.

| File | Missing test (11) | Dead or redundant code, deleted (11) | Equivalent, suppressed with reason (4) |
|---|---|---|---|
| `subscription-write-guard.ts` | — | Two early returns that the canonical ordering already decides (2), and the terminal-status list and predicate only they used (3) | `< 0` versus `<= 0` on the canonical ordering: it is 0 only for identical identities, which return earlier |
| `grading.ts` | Error codes and messages (3) | A redundant `correct === undefined` clause; the guard is rewritten so each clause is needed (1) | — |
| `statistics.ts` | An attempt at `now` with a zero-day window, and the cutoff boundary (3) | Two `computeStreak` guards the loop already handles (2) | — |
| `shuffle.ts` | — | The length ≤ 1 early return, which the loop already handles (3) | Loop bound `i > 0` versus `i >= 0`: at `i = 0` the only swap is with itself, which the guard skips |
| `shuffled-choice-views.ts` | The error message, input immutability and `sortOrder` precedence (3) | — | — |
| `persist-subscription-observation.ts` | — | — | The two message literals of the fallback throw after the bounded retry loop (2 without coverage). The last attempt throws inside the loop, so the fallback is unreachable, but the bound keeps a lost exhaustion throw from retrying forever and the type checker needs the return path. |
| `validate-feedback-context.ts` | An in-session attempt without a session, and a `history`-origin retry (2) | — | — |

Two corrections came from the full run. First, the pilot had deleted that fallback and made the loop unbounded; emptying the exhaustion block then retried forever and crashed the test runner, so the bound and its fallback stay. Second, a `Stryker disable` comment names a mutator, not one replacement, so each equality suppression also hides its non-equivalent sibling. A run with both comments removed timed out on `i <= 0`, killed `canonicalOrdering >= 0`, and left exactly the two equivalent mutants surviving. That is why six mutants are suppressed for four equivalent ones.

The archived DEBT-468 (f) recorded two write-guard survivors as equivalent for this pilot. Triage found the early returns behind them redundant and deleted them. The guard's only remaining equivalent mutant is the ordering comparison above.

**#1160 review corrections (2026-09-27).** The promotion's review found four weaknesses, fixed in the next feature PR:
- **A false suppression reason.** The write guard's equivalent-mutant reason ("ordering is 0 only for identical identities") was false: the canonical comparator ended in `localeCompare`, which returns 0 for the NFC and NFD spellings of the same id. The comparator now breaks that residual tie by code units, so it is a total order and the reason holds. Every realistic Stripe id orders as before. A write-guard case is red on the old comparator, and a Stryker run without the suppression killed `>= 0` and left only `<= 0`, now genuinely equivalent.
- **Over-pinned wording.** The grading cases matched whole error sentences. They now match the diagnostic values (question id, choice id, correct-choice count), which still kill the message mutants.
- **A stale weekly score.** Incremental results can survive a change to an unmutated import. The weekly workflow now runs `--force` and restores no incremental file.
- **A permissions check a job could bypass.** The workflow test now requires the read-only block to be the file's only `permissions:` key. A variant with a job-level `contents: write` fails it.

### Part 2 second wave triage — 2026-09-27

Full `--force` runs over the runbook's four second-wave files: baseline 91.44% (169 killed, 2 timed out, 16 survived, of 187), after triage 100.00% (167 killed, 1 timed out, of 168), with no suppression. `session-stats.ts` and `subscription-status.ts` were already at 100%.

| File | Missing test (9) | Dead or redundant code, removed (7) |
|---|---|---|
| `start-practice-session.ts` | The use case's own incomplete-session check, including its message (3). The fake repository enforces the same one-incomplete-session rule as Postgres, so only a conflict that must win over empty filters distinguishes the check. | — |
| `idempotency-error-policy.ts` | The cacheable outcomes are code-and-reason pairs: a non-`CONFLICT` error carrying a terminal-session reason is not cached (1), and the incomplete-session conflict is cached only for starting a session and only as a `CONFLICT` (4). The trial-setup helper had no unit test (1). | A three-way disposition whose two cache labels no caller distinguished, now a boolean with the reasons kept as comments (3); `new Set([])` for the billing actions, now `new Set()` (3); a `typeof` guard that `Set.has` already covers, now a set typed to accept an absent reason (1). |

### Part 2 wave 4b triage — 2026-10-01

Full `--force` runs over six small use cases, listed by name in `stryker.config.json` until the whole folder is triaged. `count-available-questions.ts` scored 100% at baseline.

| File | Missing test (17) | Equivalent, suppressed (1) |
|---|---|---|
| `end-practice-session.ts` | An already-ended session, including an ended exam, which is refused as ended before the active-exam rule (2); each error's message (3); a repository that reports a session ended without its end time (4, without coverage). | — |
| `create-portal-session.ts` | The request key reaches the gateway, and no request options are passed without one (4, two without coverage). | — |
| `discard-practice-session.ts` | A successful discard's result and the tutor refusal's message (3). | — |
| `check-entitlement.ts` | Without an injected clock, the use case reads the real time (1). | — |
| `check-trial-saved-card.ts` | — | With no subscription id, the saved-card lookup could only answer false; the guard skips the query (1, and its killed sibling). |

**Correction to wave 4a (2026-10-01).** Wave 4a's after-triage run was taken with the local incremental cache present. Even with `--force`, Stryker merges cached results into its report, and a cached kill hid one survivor in `transactional-email-payload.ts`: dropping `typeof value !== 'object'` is equivalent, because a non-object primitive fails the key checks anyway. It is now suppressed with that reason, and the comment also covers three `ConditionalExpression` siblings, all killed. Wave 4a therefore had two equivalent mutants, not one; its 100% after-triage score stands. Scores are now recorded only from cache-free runs, as the weekly workflow takes them (runbook §3).

### Part 2 wave 4a triage — 2026-09-30

Full `--force` runs over the rest of `src/application/shared/**`; `stryker.config.json` mutates the folder by glob. Of eight files, five scored 100% at baseline. The three others:

| File | Missing test (11) | Equivalent, suppressed (1) |
|---|---|---|
| `transactional-email-payload.ts` | Each error's code, where tests had matched only a message substring (4); the provider-key refusal and its message (1); a snapshot that parses to something other than an object, which reached a type guard no test fed (1, without coverage). | — |
| `fetch-questions-by-binding.ts` | A repository that returns each question under the other's id while keeping its bound revision, which only the id check catches (1); the broken-contract message (1). | `question?.id`: the lengths are checked equal first, so every index has a question (1). |
| `renewal-notice-email-format.ts` | The text and HTML renderers had no direct test. Exact-output cases now pin one line per line, one paragraph per line, and escaped anchors (3). | — |

### Part 2 third wave triage — 2026-09-30

Full `--force` runs over every production file under `src/domain/**` not already in scope; `stryker.config.json` now mutates the whole folder by glob. Of 21 files with mutants, 15 scored 100% at baseline. The six others:

| File | Missing test (35) | Dead code, removed (1) | Equivalent, suppressed (3) |
|---|---|---|---|
| `renewal-notice-delivery.ts` | The key-shape rule, which mirrors the database check, had no unit test (13). A table now covers both valid shapes and every single-field deviation. | — | — |
| `renewal-consent-record.ts` | The consumer-reference pattern's anchors (2); the error code and message of each rule, where tests had checked only the error type (8); the whole `stripe_setup` source branch (5); present but non-positive price-increase amounts (2); a later termination after an earlier one (2). | — | `>` against `>=` at equal termination instants (1). |
| `renewal-consent.ts` | No termination never extends retention, whatever the consent date (1). | — | `>` against `>=` at equal floors (1). |
| `attempt.ts` | A first attempt naming a retry parent or retry session (1). | — | — |
| `subscription-canonicalization.ts` | The locale orders mixed-case Stripe identities before code units do (1). | — | `<` against `<=` after identical identities have returned 0 (1). |
| `question-selection.ts` | — | The second loop's `continue`, unreachable because every candidate that reaches it has history. The two loops are one, with the same rules (1 survivor, 4 mutants fewer). | — |

Each suppression names `EqualityOperator`, which also covers the operator's other replacement on that line. The baseline, run without the comments, shows that the other replacement was killed on all three lines (§5).

### Part 1 CRAP top-25 baseline — 2026-08-22

Input receipts from the same working tree: unit coverage passed 450 files / 4,018 tests; integration coverage passed 40 files and skipped 1 / passed 256 tests and skipped 2; browser coverage passed 64 files / 398 tests. The reporter then required and merged `coverage/coverage-final.json`, `coverage/browser/coverage-final.json`, and `coverage/integration/coverage-final.json` before ranking. Playwright supplies no Istanbul input.

| Rank | Location | Function | Comp | Cov | CRAP |
|---:|---|---|---:|---:|---:|
| 1 | `app/(app)/app/questions/[slug]/question-page-client.tsx:188` | `QuestionView` | 84 | 100.00% | 84.00 |
| 2 | `app/(app)/app/practice/components/practice-view.tsx:312` | `PracticeView` | 48 | 100.00% | 48.00 |
| 3 | `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:758` | `createStripeCheckoutSession` | 43 | 100.00% | 43.00 |
| 4 | `src/application/use-cases/submit-answer.ts:89` | `execute` | 39 | 100.00% | 39.00 |
| 5 | `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:85` | `PracticeSessionPageView` | 32 | 100.00% | 32.00 |
| 6 | `src/adapters/shared/with-idempotency.ts:109` | `withIdempotency` | 30 | 100.00% | 30.00 |
| 7 | `app/(app)/app/history/components/history-questions-tab.tsx:121` | `HistoryQuestionsTab` | 27 | 100.00% | 27.00 |
| 8 | `app/(app)/app/practice/[sessionId]/components/practice-session-exam-results-renderer.tsx:37` | `renderPracticeSessionExamResults` | 26 | 94.74% | 26.10 |
| 9 | `src/adapters/gateways/stripe/stripe-webhook-processor.ts:314` | `processStripeWebhookEvent` | 26 | 97.14% | 26.02 |
| 10 | `src/application/use-cases/get-previous-attempt.ts:81` | `execute` | 25 | 93.75% | 25.15 |
| 11 | `src/adapters/repositories/drizzle-renewal-consent-record-repository.ts:50` | `immutableEvidenceMatches` | 25 | 100.00% | 25.00 |
| 12 | `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:31` | `PostExamReviewView` | 24 | 100.00% | 24.00 |
| 13 | `lib/env.ts:100` | `validateEnv` | 24 | 100.00% | 24.00 |
| 14 | `src/domain/entities/renewal-consent-record.ts:54` | `newRenewalConsentRecord` | 23 | 100.00% | 23.00 |
| 15 | `app/(app)/app/questions/[slug]/hooks/use-question-page-model.ts:43` | `resolveRetryOrigin` | 6 | 22.22% | 22.94 |
| 16 | `app/(app)/app/shared/question-feedback-actions.ts:82` | `rateQuestionForQuestion` | 21 | 94.87% | 21.06 |
| 17 | `src/adapters/controllers/clerk-webhook-controller.ts:228` | anonymous callback | 21 | 98.33% | 21.00 |
| 18 | `app/(app)/app/practice/components/practice-view.tsx:129` | `TutorActionBar` | 21 | 100.00% | 21.00 |
| 19 | `components/question/feedback.tsx:149` | `Feedback` | 21 | 100.00% | 21.00 |
| 20 | `app/(app)/app/shared/question-feedback-actions.ts:187` | `submitReportForQuestion` | 20 | 93.10% | 20.13 |
| 21 | `app/(app)/app/questions/[slug]/hooks/use-question-page-bookmarks.ts:141` | anonymous error callback | 4 | 0.00% | 20.00 |
| 22 | `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:139` | `findUniqueNewestMatchingCheckoutSession` | 19 | 88.24% | 19.59 |
| 23 | `components/question/choice-button.tsx:26` | `ChoiceButton` | 19 | 100.00% | 19.00 |
| 24 | `app/(app)/app/questions/[slug]/question-page-logic.ts:211` | `submitSelectedAnswer` | 18 | 94.12% | 18.07 |
| 25 | `app/(app)/app/questions/[slug]/question-page-logic.ts:378` | `loadPreviousAttempt` | 18 | 100.00% | 18.00 |

## Related

- [ADR-019](../adr/adr-019-test-quality-practices.md) (decision + observational posture), [ADR-003](../adr/adr-003-testing-strategy.md) (base strategy)
- Runbooks: [`docs/dev/code-quality-metrics.md`](../dev/code-quality-metrics.md), [`docs/dev/mutation-testing.md`](../dev/mutation-testing.md), [`docs/dev/acceptance-testing.md`](../dev/acceptance-testing.md), [`docs/dev/qa-procedures.md`](../dev/qa-procedures.md)
- Register: [`docs/qa/index.md`](../qa/index.md) (QA-001, QA-002)
- Constraints honored: coverage-as-observational (`docs/dev/react-vitest-testing.md`), DEBT-460 dual-compiler seam, DEBT-323 toggle-interaction limits, `docs/dev/stabilization-checklist.md` (absorbed by QA-001 once Active)
