# Mutation Testing (StrykerJS)

**Last Updated:** 2026-09-27

Mutation testing primarily audits the **tests** by changing the code: Stryker seeds small faults ("mutants" — `<=` → `<`, `&&` → `||`, deleted statements, flipped booleans) into production source, runs selected tests against each, and reports which mutants the suite **killed** (a test failed) versus which **survived** (every selected test still passed). A surviving mutant is either a behavior change no test noticed or an equivalent change; triage distinguishes the two. The **mutation score** = detected ÷ valid mutants.

Coverage says a line was *executed*; mutation tests whether selected behavior changes are detected. Under this repo's TDD mandate, that is a mechanical audit that the tests actually constrain behavior. The repo has already done this by hand once: the DEBT-423 resolution verified its test rewrite with "temporary mutation checks proved red-on-behavior plus green-on-refactor." Stryker automates that approach for its supported mutators. Proposed by `docs/adr/adr-019-test-quality-practices.md`; tracked as DEBT-465 Part 2.

---

## 1. Tooling and compatibility

`@stryker-mutator/core` and `@stryker-mutator/vitest-runner` are pinned at 9.6.1 in `package.json`. Every compatibility receipt below was measured on that version; Stryker 10.0.0 has since shipped, so re-verify these receipts before adopting a newer major.

- A fresh 2026-08-13 install resolved StrykerJS core and Vitest runner 9.6.1. The runner peer-accepts `vitest >= 2.0.0`; the pilot ran against the repo's installed Vitest 4.1.x.
- The runner **enforces per-test coverage analysis internally** (`coverageAnalysis` is ignored) and by default asks Vitest for tests *related* to each mutated file (`vitest.related: true`). Related selection follows the import graph and can include far more than the colocated `foo.test.ts`. The explicit `plugins` entry below is required in this pnpm layout; wildcard auto-discovery did not load the runner.
- **Skip `@stryker-mutator/typescript-checker` for now.** Its `typescript >= 3.6` peer resolves in this repo to the npm alias `@typescript/typescript6` (the TS6 preview build — see DEBT-460's dual-compiler seam). Revisit the checker only after the TS6/TS7 seam collapses.
- The runner documents **Vitest Browser Mode as unsupported**, although a local 9.6.1 smoke run completed; our integration lane is serial against a real shared Postgres. This pilot stays on the unit lane — see §2.

## 2. Scope policy — mutate only what the unit lane pins

Stryker runs the **unit config** (`vitest.config.mts`). Therefore only files whose behavior is pinned by unit-lane tests (including the planned acceptance suite from `docs/dev/acceptance-testing.md`, which will run in the same lane and add business-rule kills) produce meaningful scores. A file covered only by browser or integration tests will report surviving or `NoCoverage` mutants that mean "tested in the wrong lane for this pilot," not "badly tested" — keep such files out of `mutate` until that changes.

Never mutate: `src/**/test-helpers/**` (fakes/factories are test support), `src/application/ports/**` (port contracts), barrels.

## 3. Configuration

`stryker.config.json` at the repo root:

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "plugins": ["@stryker-mutator/vitest-runner"],
  "testRunner": "vitest",
  "vitest": {
    "configFile": "vitest.config.mts"
  },
  "mutate": [
    "src/domain/**/*.ts",
    "!src/domain/**/*.test.ts",
    "!src/domain/**/index.ts",
    "!src/domain/test-helpers/**",
    "src/application/shared/**/*.ts",
    "!src/application/shared/**/*.test.ts",
    "!src/application/shared/**/index.ts",
    "src/application/use-cases/**/*.ts",
    "!src/application/use-cases/**/*.test.ts",
    "!src/application/use-cases/**/index.ts",
    "src/adapters/controllers/shared/idempotency-error-policy.ts"
  ],
  "ignorePatterns": ["/.agents/**", "/.claude/**", "/.codex/**"],
  "incremental": true,
  "incrementalFile": ".stryker-incremental.json",
  "reporters": ["clear-text", "progress", "html", "json"],
  "htmlReporter": {
    "fileName": "reports/mutation/index.html"
  },
  "thresholds": {
    "high": 90,
    "low": 75,
    "break": null
  },
  "tempDirName": ".stryker-tmp"
}
```

- **`"break": null` is policy, not an oversight.** Coverage-adjacent metrics are observational in this repo (`docs/dev/react-vitest-testing.md`); `high`/`low` only color the report. Introducing a breaking gate requires an ADR amending ADR-019 with measured baselines.
- `incremental: true` reuses unchanged mutant results, but the initial related-test coverage run still executes on every re-run. It is for local focused loops only: Stryker 9.6.1 does not invalidate a result when an unmutated file the mutant's module imports changes, so an incremental score can be stale. Every recorded score and the weekly workflow use `--force` (#1160 review).
- **Record scores from a run without `.stryker-incremental.json`**, as the weekly workflow does. Even with `--force`, Stryker merges cached results for mutants outside the run into its report, and a cached kill can hide a survivor. On 2026-10-01, a run with the cache present missed one equivalent mutant that wave 4a's record had counted as killed.
- `.gitignore` covers `.stryker-tmp/`, `.stryker-incremental.json` and `reports/`. The incremental file lives at the repo root deliberately: Stryker cleans `tempDirName` between runs, so state stored inside `.stryker-tmp/` would be destroyed.
- `pnpm test:mutation` runs `stryker run` over every target. Focused loop while fixing one module: `pnpm exec stryker run --mutate src/domain/services/grading.ts`. Add `--force` to ignore incremental results when recording a baseline.
- The sandbox copy requires the `ignorePatterns` above because the committed agent-skill symlink trees fail copying on macOS. Do not use `--inPlace`; it mutates the working tree during the run.

## 4. Pilot targets (baseline wave)

Chosen 2026-08-13 for consequence-per-minute: small, fast, unit-tested, mostly pure or dependency-injected, and expensive to get wrong. Their focused unit tests all run in milliseconds.

| Target | Why it's first | Mutants most likely to teach us something |
|---|---|---|
| `src/domain/services/subscription-write-guard.ts` (56 loc, 21 table-driven tests) | Five sequential boolean early-returns deciding whether a different Stripe identity may overwrite a stored entitled subscription — a high-consequence pure function. The pilot audits whether the table's cases actually pin each early-return | Terminal-status redundancy; expiry/canonical-order boundaries; early-return removal |
| `src/domain/services/entitlement.ts` | The paid-product gate; `currentPeriodEnd <= now` boundary + 4-way reason ladder | Equality boundary (`<=` → `<`); the existing test pins the expiry *instant* |
| `src/domain/services/grading.ts` (5 tests) | The core grading function | Error code/message literals and the redundant `correct === undefined` guard; ID-equality and correct-count mutants are killed |
| `src/domain/services/exam-timer.ts` | Expiry boundary (`>=`) and `max(0, floor(...))`, used by the BUG-254 expiry paths | Deadline equality/arithmetic; the pilot kills these mutants |
| `src/domain/services/statistics.ts` | `computeStreak`'s today-guard and `day -= 1` walk; accuracy clamp | Redundant empty/today guards; zero-day and cutoff equality boundaries |
| `src/domain/services/shuffle.ts` + `src/application/shared/shuffled-choice-views.ts` | Determinism *is* the contract (stable per-user choice order); the pilot also probes redundant guards and stable-input normalization | Length/loop equality; stable-input sort removal/tiebreak; error-message literal |
| `src/application/shared/persist-subscription-observation.ts` | Retry-loop bounds + version-conflict discriminator; wrong can mean a nonterminating conflict retry or a lost write | Attempt-counter reversal times out; the defensive fallback is `NoCoverage` |
| `src/application/use-cases/validate-feedback-context.ts` (15 tests) | BUG-260 ownership/integrity boundary with a compound negated clause | Condition removal in the both-ID and retry-provenance ladder |

The second wave, triaged on 2026-09-27, added `src/domain/services/session-stats.ts`, `src/domain/value-objects/subscription-status.ts`, `src/application/use-cases/start-practice-session.ts` and `src/adapters/controllers/shared/idempotency-error-policy.ts` (a unit-pinned adapter policy). The third wave, triaged on 2026-09-30, covers every production file under `src/domain/**` through a glob, which excludes tests, barrels and test helpers, so a new domain module joins with its first run. Type-only modules produce no mutants. Wave 4a, triaged the same day, covers `src/application/shared/**` by the same kind of glob. Next come `src/application/use-cases/**`, subject to the §2 exclusions, in more than one wave. Wave 4b, triaged on 2026-10-01, added six small use cases by name. Wave 4c, triaged the same day, added 21 more and moved the folder to a glob. The use cases not yet triaged are excluded by name until their wave, so a new use case joins with its first run. Wave 4d, triaged the same day, added six more. Wave 4e added three. Wave 4f, `finalize-exam-answers.ts`, completed the folder, which the glob now covers without exclusions.

## 5. Triage — what each survivor means

Work the HTML report per file; classify every survivor and `NoCoverage` mutant:

1. **Missing assertion / boundary test** → write the unit test that kills it. This is TDD debt made visible; the fix is a red test, not config.
   A default clock (`now = () => new Date()`) survives as `() => undefined` when no test omits the clock. Such a test omits the constructor's clock and freezes the system clock with `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime`. It freezes at a date that changes the outcome, so it proves which clock is read, and `vi.useRealTimers()` runs after each test. Never assert against wall-clock time: a clock step during a run fails the test (#1271 review).
2. **Equivalent mutant** (provably identical behavior) → suppress narrowly with a justification:

   ```ts
   // Stryker disable next-line EqualityOperator: `<` and `<=` equivalent here — set is deduplicated above
   ```

   Suppressions without a stated reason are review-rejectable. A comment names a mutator, not one replacement, so it also silences that mutator's other replacements on the line: prove those are killed with a run that omits the comment, and record it with the triage.
3. **Dead code** → delete the code, not the mutant.
4. **Wrong-lane pin** (behavior is actually pinned by a browser/integration test) → remove the file from `mutate`, or move/duplicate the pinning test into the unit lane if it belongs there.
5. **`NoCoverage` mutants** → those locations are not exercised by the selected unit tests; cross-check the CRAP report (`docs/dev/code-quality-metrics.md`) and decide test-or-descope explicitly.

Timeouts count as detected. **Do not chase 100%** — equivalent mutants exist and suppression-spam is worse than an honest sub-100 score. The goal is a per-module ratchet: record the baseline, never regress it, raise it when you touch the module.

## 6. Cadence and CI

Mutation runs range from tens of seconds to minutes per module — they do **not** enter the per-PR pipeline initially.

- **Local, on demand:** whenever you touch a mutated module, `pnpm exec stryker run --mutate <that file>` before pushing.
- **Scheduled CI:** `.github/workflows/mutation.yml` runs `pnpm exec stryker run --force` on Mondays at 06:00 UTC and on `workflow_dispatch`. It is a separate workflow, not a step in `ci.yml`. The workflow-level `permissions: contents: read` is its only permissions block, so no job can widen it; it uses no secrets, restores no incremental file, and uploads `reports/mutation` as the `mutation-report` artifact. Every action is pinned to a full commit SHA with its release version in a comment. `tests/ci-workflow.test.ts` enforces the pins, the triggers, the single read-only permissions block, `--force` and the absence of secrets.

  The run **reports; it does not gate** (`break: null`). Once runtimes and baselines are known, a per-PR incremental variant scoped to changed files (`--mutate` from the diff) can be evaluated — via ADR, like any gate.

## 7. Score policy

The pilot baseline ran on 2026-09-27 with Stryker 9.6.1 against the unit lane. The per-file table below is the ratchet: a change to one of these files must not lower its score. DEBT-465 records the triage of every mutant.

| File | Baseline | After triage |
|---|---:|---:|
| `src/domain/services/subscription-write-guard.ts` | 83.78% | 100.00% |
| `src/domain/services/entitlement.ts` | 100.00% | 100.00% |
| `src/domain/services/grading.ts` | 85.19% | 100.00% |
| `src/domain/services/exam-timer.ts` | 100.00% | 100.00% |
| `src/domain/services/statistics.ts` | 85.71% | 100.00% |
| `src/domain/services/shuffle.ts` | 88.57% | 100.00% |
| `src/application/shared/shuffled-choice-views.ts` | 82.35% | 100.00% |
| `src/application/shared/persist-subscription-observation.ts` | 94.74% | 100.00% |
| `src/application/use-cases/validate-feedback-context.ts` | 96.83% | 100.00% |
| **All nine files** | **91.77%** | **100.00%** |

The second wave ran on 2026-09-27 the same way:

| File | Baseline | After triage |
|---|---:|---:|
| `src/domain/services/session-stats.ts` | 100.00% | 100.00% |
| `src/domain/value-objects/subscription-status.ts` | 100.00% | 100.00% |
| `src/application/use-cases/start-practice-session.ts` | 86.36% | 100.00% |
| `src/adapters/controllers/shared/idempotency-error-policy.ts` | 89.68% | 100.00% |
| **All four files** | **91.44%** | **100.00%** |

The third wave ran on 2026-09-30 over the rest of `src/domain/**`:

| File | Baseline | After triage |
|---|---:|---:|
| `src/domain/entities/attempt.ts` | 97.37% | 100.00% |
| `src/domain/entities/question-feedback.ts` | 100.00% | 100.00% |
| `src/domain/entities/renewal-consent-record.ts` | 83.74% | 100.00% |
| `src/domain/entities/renewal-notice-delivery.ts` | 51.85% | 100.00% |
| `src/domain/errors/domain-errors.ts` | 100.00% | 100.00% |
| `src/domain/services/question-selection.ts` | 94.12% | 100.00% |
| `src/domain/services/session.ts` | 100.00% | 100.00% |
| `src/domain/services/subscription-canonicalization.ts` | 92.31% | 100.00% |
| `src/domain/services/time-constants.ts` | 100.00% | 100.00% |
| `src/domain/value-objects/answer-outcome.ts` | 100.00% | 100.00% |
| `src/domain/value-objects/choice-label.ts` | 100.00% | 100.00% |
| `src/domain/value-objects/practice-mode.ts` | 100.00% | 100.00% |
| `src/domain/value-objects/question-difficulty.ts` | 100.00% | 100.00% |
| `src/domain/value-objects/question-feedback-category.ts` | 100.00% | 100.00% |
| `src/domain/value-objects/question-feedback-kind.ts` | 100.00% | 100.00% |
| `src/domain/value-objects/question-feedback-rating.ts` | 100.00% | 100.00% |
| `src/domain/value-objects/question-progress-status.ts` | 100.00% | 100.00% |
| `src/domain/value-objects/question-status.ts` | 100.00% | 100.00% |
| `src/domain/value-objects/renewal-consent.ts` | 81.82% | 100.00% |
| `src/domain/value-objects/subscription-plan.ts` | 100.00% | 100.00% |
| `src/domain/value-objects/tag-kind.ts` | 100.00% | 100.00% |
| **All 21 files with mutants** | **87.25%** | **100.00%** |

Wave 4a ran on 2026-09-30 over the rest of `src/application/shared/**`:

| File | Baseline | After triage |
|---|---:|---:|
| `src/application/shared/enrich-with-question.ts` | 100.00% | 100.00% |
| `src/application/shared/fetch-questions-by-binding.ts` | 90.00% | 100.00% |
| `src/application/shared/fetch-session-owned-questions-by-id.ts` | 100.00% | 100.00% |
| `src/application/shared/practice-session-state.ts` | 100.00% | 100.00% |
| `src/application/shared/renewal-notice-email-format.ts` | 95.95% | 100.00% |
| `src/application/shared/renewal-notice-schedule.ts` | 100.00% | 100.00% |
| `src/application/shared/subscription-canonicalization.ts` | 100.00% | 100.00% |
| `src/application/shared/transactional-email-payload.ts` | 93.18% | 100.00% |
| **All eight files** | **94.85%** | **100.00%** |

Wave 4b ran on 2026-10-01 over six use cases:

| File | Baseline | After triage |
|---|---:|---:|
| `src/application/use-cases/check-entitlement.ts` | 94.74% | 100.00% |
| `src/application/use-cases/check-trial-saved-card.ts` | 87.50% | 100.00% |
| `src/application/use-cases/count-available-questions.ts` | 100.00% | 100.00% |
| `src/application/use-cases/create-portal-session.ts` | 81.82% | 100.00% |
| `src/application/use-cases/discard-practice-session.ts` | 82.35% | 100.00% |
| `src/application/use-cases/end-practice-session.ts` | 64.00% | 100.00% |
| **All six files** | **80.85%** | **100.00%** |

Wave 4c ran on 2026-10-01 over 21 more use cases. The baselines of `get-attempted-questions.ts` and `save-exam-draft-answer.ts` include the mutants of the redundant guards that triage removed:

| File | Baseline | After triage |
|---|---:|---:|
| `src/application/use-cases/get-attempted-questions.ts` | 93.10% | 100.00% |
| `src/application/use-cases/get-bookmark-question-ids.ts` | 100.00% | 100.00% |
| `src/application/use-cases/get-bookmark-status.ts` | 100.00% | 100.00% |
| `src/application/use-cases/get-bookmarks.ts` | 90.91% | 100.00% |
| `src/application/use-cases/get-incomplete-practice-session.ts` | 100.00% | 100.00% |
| `src/application/use-cases/get-practice-session-summary.ts` | 92.31% | 100.00% |
| `src/application/use-cases/get-question-for-view.ts` | 93.06% | 100.00% |
| `src/application/use-cases/get-question-rating.ts` | 100.00% | 100.00% |
| `src/application/use-cases/get-session-history.ts` | 100.00% | 100.00% |
| `src/application/use-cases/get-user-stats.ts` | 95.24% | 100.00% |
| `src/application/use-cases/practice-session-summary.ts` | 100.00% | 100.00% |
| `src/application/use-cases/prune-renewal-consents.ts` | 66.67% | 100.00% |
| `src/application/use-cases/rate-question.ts` | 78.95% | 100.00% |
| `src/application/use-cases/record-renewal-consent.ts` | 100.00% | 100.00% |
| `src/application/use-cases/record-renewal-notice-provider-outcome.ts` | 100.00% | 100.00% |
| `src/application/use-cases/requeue-renewal-notice-delivery.ts` | 88.24% | 100.00% |
| `src/application/use-cases/save-exam-draft-answer.ts` | 97.18% | 100.00% |
| `src/application/use-cases/send-renewal-acknowledgment.ts` | 66.67% | 100.00% |
| `src/application/use-cases/set-bookmark.ts` | 100.00% | 100.00% |
| `src/application/use-cases/set-practice-session-question-mark.ts` | 100.00% | 100.00% |
| `src/application/use-cases/submit-question-report.ts` | 100.00% | 100.00% |
| **All 21 files** | **91.45%** | **100.00%** |

Wave 4d ran on 2026-10-01 over six larger use cases. Each baseline includes the mutants of code that triage removed:

| File | Baseline | After triage |
|---|---:|---:|
| `src/application/use-cases/create-checkout-session.ts` | 82.14% | 100.00% |
| `src/application/use-cases/create-trial-payment-method-setup-session.ts` | 70.45% | 100.00% |
| `src/application/use-cases/get-completed-session-questions-with-feedback.ts` | 92.86% | 100.00% |
| `src/application/use-cases/get-practice-session-review.ts` | 88.00% | 100.00% |
| `src/application/use-cases/get-previous-attempt.ts` | 83.33% | 100.00% |
| `src/application/use-cases/submit-answer.ts` | 95.15% | 100.00% |
| **All six files** | **87.80%** | **100.00%** |

Wave 4e ran on 2026-10-01 over three more. Each baseline includes the mutants of code that triage removed:

| File | Baseline | After triage |
|---|---:|---:|
| `src/application/use-cases/dispatch-renewal-notice-delivery.ts` | 87.05% | 100.00% |
| `src/application/use-cases/get-next-question.ts` | 83.43% | 100.00% |
| `src/application/use-cases/send-due-renewal-notices.ts` | 73.22% | 100.00% |
| **All three files** | **81.28%** | **100.00%** |

Wave 4f ran on 2026-10-01 over the last use case, the exam's final grading. Its baseline includes the mutants of code that triage removed:

| File | Baseline | After triage |
|---|---:|---:|
| `src/application/use-cases/finalize-exam-answers.ts` | 75.12% | 100.00% |

Modules written after the pilot join the list with their first run:

| File | First run | Score |
|---|---|---:|
| `src/domain/services/subscription-anniversary.ts` | 2026-09-27, DEBT-414 F02 | 100.00% (39 mutants: 18 killed, 21 timed out) |

The after-triage scores exclude suppressed equivalent mutants, each with its reason in the source, and the siblings those comments also cover (§5). By wave:

- **Pilot:** four equivalent mutants and two siblings.
- **Third wave:** three and three. Its `EqualityOperator` comments each cover two replacements of one operator; the baseline, run without the comments, shows only the equivalent replacement survived.
- **Wave 4a:** two equivalent mutants and three siblings: an `OptionalChaining` mutant, and the `typeof` check in `transactional-email-payload.ts`, whose comment covers three killed `ConditionalExpression` siblings.
- **Wave 4b:** one equivalent mutant and one sibling.
- **Wave 4c:** two equivalent mutants and two siblings, all in `get-question-for-view.ts`. Two redundant guards were removed rather than suppressed: the empty-page return in `get-attempted-questions.ts`, since the binding fetch already returns nothing for no rows, and the `typeof` check in `save-exam-draft-answer.ts`, since `Number.isFinite` is false for every non-number.
- **Wave 4d:** two equivalent mutants and two siblings, in `get-previous-attempt.ts`: a review without a session id and a standalone attempt each look up a session that cannot exist. Refactors removed 54 mutants with the code they sat on. `get-previous-attempt.ts` had two copies of the attempt read, now merged. Two session readers indexed past a guard that a `for…of` loop makes unnecessary. `submit-answer.ts` had two conditions that valid provenance and `??` already imply, and an explanation redaction no request could reach.
- **Wave 4e:** three equivalent mutants, without siblings. In `dispatch-renewal-notice-delivery.ts`, the status a gateway exception records: any status other than accepted, transient or terminal is persisted as unknown. In `get-next-question.ts`, the rewritten search repeats the items after the start, which by then hold no unanswered item. In `send-due-renewal-notices.ts`, the fallback for a change notice's description, since a change notice without one is never queued. Refactors removed 45 mutants from `get-next-question.ts`. Its search for the next item is now one rotation of the session's items, replacing three passes and an upper clamp it never needed, and three redundant input checks went. In `dispatch-renewal-notice-delivery.ts`, three null checks on a scheduled notice's applicable date became one guard that fails loudly. In `send-due-renewal-notices.ts`, notice validation threw errors whose messages no caller could see; it is now a predicate.
- **Wave 4f:** two equivalent mutants and five siblings, in `finalize-exam-answers.ts`. A final-draft flush tests for a deadline, but only an exam reaches it, and an exam always has one. Refactors removed 44 mutants. The checks repeated before the transaction went, since the transaction makes them. A flush applied after the deadline is the same as a flush applied, and a past-grace test is answered by the early return before it. The latest answer time is a `Math.max`, not a comparison whose equal case changes nothing.

100% here is what triage left, not a target. Do not predict thresholds from test counts alone: `grading.ts` and `subscription-write-guard.ts` deliberately sample a 5-test suite and a 21-case table because mutation testing reveals strength or gaps that raw counts cannot.
