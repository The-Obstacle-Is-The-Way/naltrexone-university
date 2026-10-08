# DEBT-465: Advanced Test-Quality Practices Adoption (CRAP Report, Mutation Testing, Acceptance Tests, UI QA Procedures)

**Status:** Resolved — 2026-10-08: Parts 1–3 shipped; Part 4's two QA runs are Deferred to the production bootstrap and the first live purchase (AUDIT-015)
**Priority:** P2
**Date:** 2026-08-13
**Source:** [ADR-019](../../adr/adr-019-test-quality-practices.md) (Accepted, amended 2026-10-03) + the 2026-08-13 audit of the test estate
**Scope:** Execution of the four practices ADR-019 proposes to adopt. The runbooks are written and canonical; this item tracks the *work* — script, pilot, harness, and register activation. Owner-initiated waves; nothing here is a shortcut in shipped code.

---

## Description

**Current position.** Parts 1 and 2 are complete, and Part 3's replacement, the rule-to-test register, is done; Part 4 remains. The dated September audit and October 3 design assessment are historical. The October 4 mapping found five missing or misplaced proofs, so the October 3 claim that all candidate rules were already proven was too broad. The register closes those gaps; its title check proves test discovery, not the sufficiency of an assertion.

**2026-09-21 audit forward pointer.** Part 1 is shipped: `package.json` exposes `quality:crap`, and the reporter requires all three Istanbul inputs. The top-25 table below is the **2026-08-22 baseline**, not a fresh measurement of today's tree. The opening 556-file census and “no ranked report” observation are likewise filing history. Part 2's pilot and second wave shipped on 2026-09-27 (below); widening to `src/domain/**` and the application layer remains. Parts 3–4 remain unimplemented: no acceptance directory exists, and QA-001/QA-002 both remain Draft without their required two complete evidenced runs. ADR-019 still requires a new ADR before a metric gates CI. The existing entitlement-loss E2E means that particular item in the older QA-gap inventory is no longer absent. [Current-tree audit and limits](../../debt/assets/active-audit-2026-09-21/verification.md).

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

**2026-10-01:** widening is complete. `stryker.config.json` mutates the production files under `src/domain/**`, `src/application/shared/**` and `src/application/use-cases/**` by glob. The globs exclude only tests, barrels (`index.ts`) and domain test helpers, no file is excluded by name, and every survivor is triaged (third wave and waves 4a–4f, below).

### Part 3 — Acceptance-test harness

`docs/dev/acceptance-testing.md` §8. Install `@amiceli/vitest-cucumber`, build `tests/acceptance/support/application-driver.ts` verb-by-verb, land features #1 and #4 (session-start conflict; tutor/exam feedback split), then #2/#3/#10 (entitlement + trial). Update the Test Locations tables (`AGENTS.md`, `.claude/rules/testing.md`) in the first feature's PR. From then on new business rules ship their feature file first.

**Not adopted (decision, 2026-10-03).** See [Decision — 2026-10-03](#decision--2026-10-03). It is replaced by a rule-to-test register; no harness and no new dependency.

**The register is done (2026-10-04).** [`docs/dev/acceptance-testing.md`](../../dev/acceptance-testing.md) is now the register: 23 rules, each stated in plain language with the tests that prove it.
- **The rules.** R1–R17 are the earlier backlog, restated where the code has moved on:
  - R6 now records omitted items, and the accuracy rule moved to R20 under DEBT-494's amendment;
  - R8 states the discard rule as enforced;
  - R15 names a bookmarked question's state.

  R18–R22 add DEBT-493's rules: availability, content only to a learner who answered, scoring, key corrections and the submit warning. R23 pins the session size.
- **The check.** `tests/rule-to-test-register.test.ts` runs on every `pnpm test`, through `scripts/rule-to-test-register.ts`.
  - It fails when a named file is missing or no longer declares a running test with the named title, or when a rule names no test.
  - It parses each file with the TypeScript compiler. A test does not count if it is:
    - commented out, skipped, todo, or skipped by its options (`{ skip: true }`, quoted or not);
    - conditional (`runIf`, `skipIf`);
    - declared under a condition (an `if` or ternary branch, after `&&`, `||` or `??`, in a `switch` case or in a `catch` block);
    - inside a skipped `describe`.

    `it.each` and `test.each` titles count. So does a test in a loop, a `try` block or a `finally` block.
  - A malformed heading or proof line, or a repeated rule number, is reported, not skipped.
  - In review, CodeRabbit found gaps over three rounds:
    - the first version matched source text;
    - it silently ignored malformed lines;
    - it counted option-skipped and `runIf` tests;
    - it counted tests declared under an ordinary condition.

    Each was fixed, and the last was closed as a class rather than form by form. Twenty-five targeted mutations of the check each fail a case.
- **Five rules had no proof at the right level.** Mapping each rule to its tests found them, and each now has a test:
  - **R23**, the 1–200 session size: nothing sent 200 or 201, so the schema could drift from the constant unnoticed. Schema cases accept 1 and 200 and refuse 0 and 201, and a starter case pins 1–100 within the server's range.
  - **R11**, scheduled cancellation keeps access: only the hosted-Stripe E2E proved it. A domain case now does.
  - **R17**, one key, one session: nothing ran two overlapping starts on real Postgres. `start-session-idempotency.integration.test.ts` does, and the second request's claim is observed refused before the first completes.
  - **R19**, content hidden on an omitted item: no case named the under-review state. The previous-attempt cases now run for withdrawn, under review and retired.
  - **R8**, attempts never deleted: this is restated as what is enforced. A tutor session, which holds the graded attempts, cannot be discarded at all.
- **Evidence.** Eight targeted mutations each fail a case, across the reveal guard, entitlement, both schema bounds, the starter's maximum and the check itself. Renaming a proving test fails the check, naming the rule and the title.

### Part 4 — UI QA register activation

`docs/dev/qa-procedures.md` + `docs/qa/index.md`. Execute QA-001 and QA-002 twice each — complete end-to-end runs, in modes able to perform every step including the `⚠ human/PW` ones, per `docs/dev/qa-procedures.md`'s two-evidenced-runs gate — promote them Draft → Active with evidence in `docs/qa/assets/`, then file the backlog procedures (sign-up/first-run, error/404/loading, mobile sweep, a11y sweep, account-deletion-with-disposable-account, …) as they're needed by real PRs. Wire the per-PR "touched-surface procedure + screenshots" habit into review expectations.

**Re-scoped (decision, 2026-10-03).** The procedures run before the production bootstrap and before a release that changes their flows, not before every promotion. See [Decision — 2026-10-03](#decision--2026-10-03).

## Decision — 2026-10-03

Decided under the owner's 2026-10-03 delegation ("deciding all that we need to decide … anything that can be done in code"), after a read-only review of what each part would add to today's test estate. That estate is:
- 51 use-case unit files, at a 100% mutation score across `src/domain/**`, `src/application/shared/**` and `src/application/use-cases/**`;
- 91 integration files on real Postgres;
- 77 browser specs;
- 28 E2E spec files;
- 4 daily Stripe-hosted journeys.

**Part 3 is not adopted.**
- **The 17 candidate rules are already proven.**
  - Twelve of them (#1, #3–#10, #14–#16) are domain or use-case rules, already pinned by mutation-proven unit tests.
  - The other five (#2, #11–#13, #17) live in adapters or controllers. They are already covered on real Postgres and in E2E, and re-testing them over fakes would be *lower* fidelity, against DEBT-472's own rule.
- **The "rule moves into a component" guard does not hold.** A scenario run against the use case cannot see a rule *duplicated* in a hook. It only catches the rule's removal from the use case, which mutation-proven tests already catch.
- **The remaining value is readability.** It would come at the price of a new dependency, whose code-generation entry point is broken, and a second test vocabulary.
- **The replacement keeps that value at little cost:** a **rule-to-test register** in `docs/dev/acceptance-testing.md`. It names each business rule in plain language and links the tests that prove it, so a clinician can read what the system guarantees. A rule whose tests are deleted or renamed fails a documentation check.

**Part 4 is kept and re-scoped.**
- **It closes a real gap:** route-level UI that no automated lane reaches. That covers Clerk sign-in and sign-up, error, 404 and loading states, a mobile sweep, an accessibility sweep, account deletion, exam-timer expiry, and history filters at the route level.
- **The cadence changes.** As a per-promotion gate (15–20 minutes each, with no named executor) it does not fit how often this repository promotes. The procedures run before the production bootstrap and before any release that changes their flows. `docs/dev/qa-procedures.md` says so from this decision on.
- **The gap list in `docs/dev/qa-procedures.md` is updated.** Paid Checkout and the portal round trip are now in the daily hosted smoke.

**ADR-019** is amended to match, and moves from Proposed to Accepted for what shipped.

## Verification

- [x] Part 1: `scripts/crap-report.ts` + colocated test landed; baseline top-25 recorded below; hotspot table reconciled
- [x] Part 2 pilot: baseline and after-triage scores recorded below; zero un-triaged survivors in the nine pilot files (2026-09-27)
- [x] Part 2 weekly workflow live: `.github/workflows/mutation.yml` reached `main` through #1160; a dispatched run on `main` at `f036da70` ([36344618005](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/36344618005), 19:30:51Z–19:37:07Z) instrumented 13 files with 463 mutants and scored 100% (454 killed, 3 timed out, 6 suppressed), matching the local runs, and uploaded its `mutation-report` artifact. Mondays at 06:00 UTC from then on.
- [x] Part 2 second wave: the runbook §4 second-wave files, baseline and after-triage scores recorded below (2026-09-27)
- [x] Part 2 widening: every production file under `src/domain/**`, `src/application/shared/**` and `src/application/use-cases/**`, by glob, with every survivor triaged (third wave 2026-09-30; waves 4a–4f by 2026-10-01, below)
- [x] Part 3 (replaced 2026-10-03): the rule-to-test register lists 23 business rules (the 17 candidates and six added since) with the tests that prove each, and a renamed or deleted test fails its check. Done 2026-10-04 (above)
- [ ] Part 4 (re-scoped 2026-10-03): QA-001 and QA-002 Active, each with two evidenced runs; the gap list is updated (the cadence was updated with the decision); operator-checklist item 8 references the register. *Deferred 2026-10-08 (AUDIT-015): QA-001 runs before the production content bootstrap (DEBT-483), and QA-002 with the first live purchase (DEBT-501 item 7); the debt index's Deferred table holds the trigger.*
- [x] Standing: no numeric gate introduced anywhere without a new ADR (ADR-019 Compliance). *Moved 2026-10-08: this is ADR-019's standing rule, not a task; it stays in ADR-019 (AUDIT-015).*

### Baselines (fill on first runs — no invented numbers)

| Measure | Date | Result |
|---|---|---|
| CRAP top-25 snapshot | 2026-08-22 | Required three-lane merged baseline (unit + browser + integration): 445 files / 2,177 functions; 6 scores ≥30, none >100; highest `QuestionView` at 84.00. Full measured snapshot below. |
| Mutation second wave | 2026-09-27 | Four files: baseline 91.44% (187 mutants), after triage 100.00% (168), no suppression. Triage below. |
| Mutation third wave | 2026-09-30 | Every other production file under `src/domain/**`, by glob: 21 with mutants. Baseline 87.25% (267 killed, 39 survived, of 306). After triage 100.00% (295 killed, 1 timed out, of 296 scored; 6 suppressed). The full weekly scope then scored 100.00% (763 killed, 26 timed out, 12 suppressed) in 6 min 6 s. Triage below. |
| Mutation wave 4a | 2026-09-30 | The rest of `src/application/shared/**`, by glob: eight files. Baseline 94.85% (216 killed, 5 timed out, 11 survived and 1 without coverage, of 233). After triage 100.00% (230 killed, 2 timed out, of 232; 1 suppressed). The full weekly scope then scored 100.00% (993 killed, 28 timed out, 13 suppressed) in 7 min 9 s. Triage below. |
| Mutation wave 4b | 2026-10-01 | Six small use cases, by name. Baseline 80.85% (76 killed, 13 survived and 5 without coverage, of 94). After triage 100.00% (92 killed, of 92; 2 suppressed). The full weekly scope, run without the incremental cache, then scored 100.00% (1,087 killed, 22 timed out, 19 suppressed) in 5 min 41 s. Triage below. |
| Mutation wave 4c | 2026-10-01 | 21 more use cases; the folder now joins by glob, with the ten untriaged use cases excluded by name. Baseline 91.45% (385 killed, 30 survived and 6 without coverage, of 421). After triage 100.00% (405 killed, of 405; 4 suppressed), once two redundant guards and their 12 mutants were removed. The full weekly scope, run without the incremental cache, then scored 100.00% (1,489 killed, 25 timed out, 23 suppressed) in 5 min 49 s. Triage below. |
| Mutation wave 4d | 2026-10-01 | Six larger use cases. Baseline 87.80% (502 killed, 2 timed out, 45 survived and 25 without coverage, of 574). After triage 100.00% (516 killed, of 516; 4 suppressed), once refactors removed 54 mutants with duplicated, redundant or unreachable code. The full weekly scope, run without the incremental cache, then scored 100.00% (2,005 killed, 25 timed out, 27 suppressed) in 6 min 35 s. Triage below. |
| Mutation wave 4e | 2026-10-01 | Three use cases. Baseline 81.28% (441 killed, 2 timed out, 81 survived and 21 without coverage, of 545). After triage 100.00% (488 killed and 2 timed out, of 490 scored; 3 suppressed), once refactors removed 52 mutants net. The full weekly scope, run without the incremental cache, then scored 100.00% (2,494 killed, 26 timed out, 30 suppressed) in 6 min 46 s. Triage below. |
| Mutation wave 4f | 2026-10-01 | `finalize-exam-answers.ts`, the last use case. Baseline 75.12% (160 killed, 32 survived and 21 without coverage, of 213). After triage 100.00% (162 killed, of 162; 7 suppressed), once refactors removed 44 mutants net. The full weekly scope, run without the incremental cache, then scored 100.00% (2,656 killed, 26 timed out, 37 suppressed) in 7 min 7 s, across the 80 files in the weekly report. Triage below. |
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

### Part 2 wave 4f triage — 2026-10-01

Cache-free full `--force` runs over `finalize-exam-answers.ts`, which grades an exam when it ends. Nine tests were added and one strengthened.

- **Checks repeated before the transaction.** The use case checked the session for being missing, not an exam, or already ended, before its transaction, then again inside it. The outer copy guarded nothing the inner one did not, so it went. The inner checks' existing tests now reach them. Three conflict tests had sequenced their fake's reads around the outer copy; they now use plain fakes.
- **A flush applied after the deadline.** A final draft is applied only at or after the deadline, within its grace window. "Applied after the deadline" was therefore just "applied". Likewise, the grace window's upper bound is always met by the time it is tested, because a flush past it returns earlier.
- **The latest answer time.** It was kept by comparing dates, and an equal date changes nothing. It is now a `Math.max` over epoch milliseconds, and `computeFinalExamEndedAt` takes it in that form.
- **Test files.** The final-draft flush tests moved from the deadline suite to their own file, `finalize-exam-answers-final-draft.test.ts`, which leaves room under the 800-line limit.

| Missing test (39) | Equivalent, suppressed (2) | Code removed or rewritten (12) |
|---|---|---|
| Only a second finalize's conflict, an attempt already answered in the session, becomes "already ended"; a different conflict, another code or a non-application error stays as it is (7). The already-ended error keeps that conflict as its cause (1). The missing-session, non-exam and ended-session checks, now reached by existing tests (12, nine without coverage). A draft whose saved time is not a number records none (1). An item answered before exam drafts existed is left as it is (1). A drafted item whose question can no longer be read fails (4, three without coverage). A repository that does not end the session fails loudly (4, three without coverage). A flush applies to the item it names (1). A flushed item whose question can no longer be read fails (4, three without coverage). A session that disappears after the flush is saved fails (4, three without coverage). | A flush's two deadline null checks: only an exam reaches them, and an exam always has a deadline (2, with five killed siblings). | The checks repeated before the transaction (4), the flush-after-deadline test (3), the date comparison now a `Math.max` that the new ordering test kills (4) and the always-met grace bound (1). |

### Part 2 wave 4e triage — 2026-10-01

Cache-free full `--force` runs over three use cases. 16 tests were added and nine strengthened. `send-due-renewal-notices.ts`'s content tests moved to their own file, `send-due-renewal-notices-content.test.ts`.

- **`get-next-question.ts`.**
  - Its search for the next item ran three passes over the session's items: those after the start, then those before it, then the start itself. It also clamped the start to the last item, which changed nothing. The search is now one rotation of the items.
  - Three input checks were redundant: a `typeof` beside the session-id test, a second test for missing filters, and a `slice()` before sorting, now `toSorted()`.
  - Two not-found checks became one.
  - The early return for no candidates went, since the selection already answers null for none.
  - The rotation's own equivalent mutant is suppressed, as the table records.
- **`dispatch-renewal-notice-delivery.ts`.** The key shape (`renewal_notice_deliveries_key_shape_chk`) gives every scheduled notice an applicable date. Three null checks on that date silently treated a missing one as a changed renewal date. One guard now fails loudly on such a corrupt row.
- **`send-due-renewal-notices.ts`.** Notice validation threw errors whose messages no caller could see, since the caller only counted them; it is now a predicate. The notice is the subscriber's statutory notice of renewal or change, so a test pins its exact text and HTML, and each kind's heading.

| File | Missing test (76) | Equivalent, suppressed (2, and 1 the rewrite introduced) | Code removed (24) |
|---|---|---|---|
| `dispatch-renewal-notice-delivery.ts` | Without an injected clock or attempt ids, the use case reads the system clock and makes its own (2, one without coverage). An unexpected failure while checking the payload is rethrown, not recorded as an integrity failure (1). A fee-change notice past a renewal reminder's cutoff is still sent (3). An account that no longer exists counts as a changed destination (1). An anniversary reminder with no billing anchor is refused (1). A lost claim while refusing a notice is reported (3, two without coverage). A claim without its attempt id fails loudly (4, three without coverage). Each provider failure's class (3). An annual reminder is revalidated like a renewal notice (2). The not-found message (1). | The status a gateway exception records: any status other than accepted, transient or terminal is persisted as unknown (1). | The null checks on the applicable date (3). |
| `get-next-question.ts` | A question the session does not hold is refused, by the merged not-found check (8, six without coverage). An answered tutor item whose question has no correct choice fails loudly (4, three without coverage). A filter-mode question is not marked superseded (1). The missing-input message (1). The selection's null for no candidates, now reached by an existing test (1). | The rewritten search repeats the items after the start, which by then hold no unanswered item (a mutant the rewrite introduced, not a baseline gap). | The three-pass search and its clamp (8), the redundant input checks (4) and the early return for no candidates (1). |
| `send-due-renewal-notices.ts` | The exact notice text and HTML (8). Each kind's heading (12). A whitespace-only subscription id or disclosure version is rejected (4). A change notice without a description, or with only whitespace, is rejected (8). A zero amount is queued (1). The destination is trimmed (1). A processing claim younger than 15 minutes is left alone (2). Without an injected clock or ids, the use case reads the system clock and makes its own (2, one without coverage). The limit caps the dispatched batch (1). A queueing failure that is not an `Error` is logged by its kind alone (1, without coverage). | A change notice's description fallback, since a change notice without one is never queued (1, without coverage). | The validation errors' unobservable messages and their catch (8, three without coverage). |

### Part 2 wave 4d triage — 2026-10-01

Cache-free full `--force` runs over six larger use cases. 16 tests were added and seven strengthened. Where a survivor sat on duplicated or redundant code, the code was removed rather than the mutant suppressed:

- **`get-previous-attempt.ts`.** It read an attempt in two copies, one for session attempts and one for standalone attempts; they are now one. Its session reader was optional, defaulting to one that finds no session. Only tests relied on the default, and a use case built with it would have shown an attempt from an exam still in progress. The reader is now required.
- **`get-practice-session-review.ts` and `get-completed-session-questions-with-feedback.ts`.** Each indexed the session's items past a guard that iterating with `for…of` makes unnecessary.
- **`submit-answer.ts`.** It tested both the retry origin and the retry session, which valid provenance makes equivalent. It also checked `typeof` where `??` suffices. Its explanation redaction was unreachable: exam and ended sessions are refused before it, so every result it saw showed the answer. That redaction is gone, and the refusals stay tested.

| File | Missing test (46) | Equivalent, suppressed (2) | Code removed (22) |
|---|---|---|---|
| `create-checkout-session.ts` | A subscription whose period ends exactly now does not block checkout (1). A missing Clerk user id is refused before any customer is created (4, three without coverage). Renewal terms for another plan are refused, because they would disclose the wrong price (4, three without coverage). The request key reaches Checkout, and no request options pass without one (4, two without coverage). The already-subscribed and changed-offer messages (2). | — | — |
| `create-trial-payment-method-setup-session.ts` | Without an injected clock, the system clock decides: frozen inside the trial, the request is admitted, and at its end it is refused (1, without coverage). A user with no subscription is refused (1). A trial missing its Stripe subscription id, or its Stripe customer, fails before Stripe (5, three without coverage). Renewal terms for another plan are refused (4, three without coverage). The expired-trial and changed-terms messages (2). | — | — |
| `get-practice-session-review.ts` | A missing session (4, three without coverage). An exam item is omitted only once the exam has ended and finalized it unanswered: an item of an exam in progress, one never graded and one never finalized are not (3). | — | The loop's index guard (2). |
| `get-completed-session-questions-with-feedback.ts` | The not-found and in-progress messages (2). A withdrawn question stays reviewable when an attempt is the only record of the answer (1). A question without a correct choice fails loudly (1). The missing-question warning (1). | — | The loop's index guard (2). |
| `get-previous-attempt.ts` | A session review reveals the requested item's answer key, not the first item's (1). An attempt from a finished exam is reviewable, with the session's mode (2). The wrong-question message (1). | A review without a session id, and a standalone attempt, each look up a session that cannot exist (2, each with a killed sibling). | The duplicated attempt read (10, six without coverage), the optional session reader (1) and a condition the both-ids refusal already implies (1). |
| `submit-answer.ts` | A session-review retry's telemetry reports a retry session and no parent attempt (2). | — | The redundant retry-origin and `typeof` conditions (4) and the unreachable explanation redaction (2, one without coverage). |

### Part 2 wave 4c triage — 2026-10-01

Cache-free full `--force` runs over 21 more use cases: the rest of the folder up to about 160 lines each. Eleven scored 100% at baseline: `get-bookmark-question-ids.ts`, `get-bookmark-status.ts`, `get-incomplete-practice-session.ts`, `get-question-rating.ts`, `get-session-history.ts`, `practice-session-summary.ts`, `record-renewal-consent.ts`, `record-renewal-notice-provider-outcome.ts`, `set-bookmark.ts`, `set-practice-session-question-mark.ts` and `submit-question-report.ts`. Nine tests were added and five strengthened.

| File | Missing test (31) | Equivalent, suppressed (2) | Redundant code removed (3) |
|---|---|---|---|
| `send-renewal-acknowledgment.ts` | The acknowledgment is the subscriber's written record of the terms, so a test pins its exact text and HTML (11). An annual consent without a trial states a yearly price and that no trial was recorded, with its HTML escaped (3, one without coverage). The missing-destination message (3). | — | — |
| `rate-question.ts` | A repository that answers a rating with a report fails loudly (4, three without coverage). | — | — |
| `get-question-for-view.ts` | An answer in a finished exam is reviewable; an answer whose session is no longer found stays reviewable; a question deleted after its slug is read shows nothing rather than failing (3). | An unknown slug has no published question either, so the reads after the guard also end in null; a standalone attempt has no session, and a lookup without an id finds none (2, each with a killed sibling). | — |
| `requeue-renewal-notice-delivery.ts` | Without an injected clock, the requeue is stamped with the real time; the missing-evidence message (2). | — | — |
| `prune-renewal-consents.ts`, `get-user-stats.ts` | Without an injected clock, each reads the real time (2, without coverage). | — | — |
| `save-exam-draft-answer.ts` | A question outside the session is refused even when the session's own question is readable (1). | — | `typeof` before `Number.isFinite`, which is false for every non-number (1). |
| `get-attempted-questions.ts` | — | — | The empty-page return: the binding fetch already returns nothing for no rows (2). |
| `get-bookmarks.ts` | An available bookmark logs no warning (1). | — | — |
| `get-practice-session-summary.ts` | The not-found message (1). | — | — |

**Follow-up (2026-10-01, promotion #1271's review).** The three default-clock tests above, and wave 4b's entitlement one, read the real system time, so a clock step during a run could fail them. Each now freezes the system clock at a date that changes the outcome and still omits the use case's clock; the mutants stay killed. The rule is in runbook §5.

### Part 2 wave 4b triage — 2026-10-01

Full `--force` runs over six small use cases, listed by name in `stryker.config.json` until the whole folder is triaged (wave 4c, above, moved the folder to a glob). `count-available-questions.ts` scored 100% at baseline.

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

- [ADR-019](../../adr/adr-019-test-quality-practices.md) (decision + observational posture), [ADR-003](../../adr/adr-003-testing-strategy.md) (base strategy)
- Runbooks: [`docs/dev/code-quality-metrics.md`](../../dev/code-quality-metrics.md), [`docs/dev/mutation-testing.md`](../../dev/mutation-testing.md), [`docs/dev/acceptance-testing.md`](../../dev/acceptance-testing.md), [`docs/dev/qa-procedures.md`](../../dev/qa-procedures.md)
- Register: [`docs/qa/index.md`](../../qa/index.md) (QA-001, QA-002)
- Constraints honored: coverage-as-observational (`docs/dev/react-vitest-testing.md`), DEBT-460 dual-compiler seam, DEBT-323 toggle-interaction limits, `docs/dev/stabilization-checklist.md` (absorbed by QA-001 once Active)
