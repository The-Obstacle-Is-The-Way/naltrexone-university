# Mutation Testing (StrykerJS)

**Last Updated:** 2026-08-13

Mutation testing primarily audits the **tests** by changing the code: Stryker seeds small faults ("mutants" — `<=` → `<`, `&&` → `||`, deleted statements, flipped booleans) into production source, runs selected tests against each, and reports which mutants the suite **killed** (a test failed) versus which **survived** (every selected test still passed). A surviving mutant is either a behavior change no test noticed or an equivalent change; triage distinguishes the two. The **mutation score** = detected ÷ valid mutants.

Coverage says a line was *executed*; mutation tests whether selected behavior changes are detected. Under this repo's TDD mandate, that is a mechanical audit that the tests actually constrain behavior. The repo has already done this by hand once: the DEBT-423 resolution verified its test rewrite with "temporary mutation checks proved red-on-behavior plus green-on-refactor." Stryker automates that approach for its supported mutators. Proposed by `docs/adr/adr-019-test-quality-practices.md`; tracked as DEBT-465 Part 2.

---

## 1. Tooling and compatibility

```bash
pnpm add -D @stryker-mutator/core@9.6.1 @stryker-mutator/vitest-runner@9.6.1
```

(9.6.1 is the version every compatibility receipt below was measured on; Stryker 10.0.0 has since shipped — re-verify those receipts before adopting a newer major.)

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
  "vitest": { "configFile": "vitest.config.mts" },
  "mutate": [
    "src/domain/services/subscription-write-guard.ts",
    "src/domain/services/entitlement.ts",
    "src/domain/services/grading.ts",
    "src/domain/services/exam-timer.ts",
    "src/domain/services/statistics.ts",
    "src/domain/services/shuffle.ts",
    "src/application/shared/shuffled-choice-views.ts",
    "src/application/shared/persist-subscription-observation.ts",
    "src/application/use-cases/validate-feedback-context.ts"
  ],
  "ignorePatterns": ["/.agents/**", "/.claude/**", "/.codex/**"],
  "incremental": true,
  "incrementalFile": ".stryker-incremental.json",
  "reporters": ["clear-text", "progress", "html", "json"],
  "htmlReporter": { "fileName": "reports/mutation/index.html" },
  "thresholds": { "high": 90, "low": 75, "break": null },
  "tempDirName": ".stryker-tmp"
}
```

- **`"break": null` is policy, not an oversight.** Coverage-adjacent metrics are observational in this repo (`docs/dev/react-vitest-testing.md`); `high`/`low` only color the report. Introducing a breaking gate requires an ADR amending ADR-019 with measured baselines.
- `incremental: true` reuses unchanged mutant results, but the initial related-test coverage run still executes on every re-run.
- Add `.stryker-tmp/`, `.stryker-incremental.json`, and `reports/` to `.gitignore` in the adoption PR. The incremental file lives at the repo root deliberately: Stryker cleans `tempDirName` between runs, so state stored inside `.stryker-tmp/` would be destroyed.
- Add a script: `"test:mutation": "stryker run"`. Focused loop while fixing one module: `pnpm exec stryker run --mutate src/domain/services/grading.ts`.
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

Second wave once the pilot is triaged: `src/domain/services/session-stats.ts`, `src/domain/value-objects/subscription-status.ts`, `src/application/use-cases/start-practice-session.ts`, `src/adapters/controllers/shared/idempotency-error-policy.ts` (a unit-pinned adapter policy), then production files across `src/domain/**`, then `src/application/{use-cases,shared}/**`, subject to the §2 exclusions.

## 5. Triage — what each survivor means

Work the HTML report per file; classify every survivor and `NoCoverage` mutant:

1. **Missing assertion / boundary test** → write the unit test that kills it. This is TDD debt made visible; the fix is a red test, not config.
2. **Equivalent mutant** (provably identical behavior) → suppress narrowly with a justification:

   ```ts
   // Stryker disable next-line EqualityOperator: `<` and `<=` equivalent here — set is deduplicated above
   ```

   Suppressions without a stated reason are review-rejectable.
3. **Dead code** → delete the code, not the mutant.
4. **Wrong-lane pin** (behavior is actually pinned by a browser/integration test) → remove the file from `mutate`, or move/duplicate the pinning test into the unit lane if it belongs there.
5. **`NoCoverage` mutants** → those locations are not exercised by the selected unit tests; cross-check the CRAP report (`docs/dev/code-quality-metrics.md`) and decide test-or-descope explicitly.

Timeouts count as detected. **Do not chase 100%** — equivalent mutants exist and suppression-spam is worse than an honest sub-100 score. The goal is a per-module ratchet: record the baseline, never regress it, raise it when you touch the module.

## 6. Cadence and CI

Mutation runs range from tens of seconds to minutes per module — they do **not** enter the per-PR pipeline initially.

- **Local, on demand:** whenever you touch a mutated module, `pnpm exec stryker run --mutate <that file>` before pushing.
- **Scheduled CI:** a separate workflow (weekly + `workflow_dispatch`), not a step in `ci.yml`:

  ```yaml
  name: Mutation
  on:
    schedule: [{ cron: "0 6 * * 1" }]   # Mondays 06:00 UTC
    workflow_dispatch:
  jobs:
    mutation:
      runs-on: ubuntu-24.04
      steps:
        # checkout / pnpm / node 24 setup identical to ci.yml
        - run: pnpm install --frozen-lockfile
        - uses: actions/cache@<pinned-sha>
          with:
            path: .stryker-incremental.json
            key: stryker-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.run_id }}
            restore-keys: stryker-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-
        - run: pnpm exec stryker run
        - uses: actions/upload-artifact@<pinned-sha>
          with: { name: mutation-report, path: reports/mutation }
  ```

  Pin actions following `ci.yml`'s conventions (`actions/checkout` and `pnpm/action-setup` are SHA-pinned there; `setup-node`/`upload-artifact` ride major tags). The run **reports; it does not gate** (`break: null`). Once runtimes and baselines are known, a per-PR incremental variant scoped to changed files (`--mutate` from the diff) can be evaluated — via ADR, like any gate.

## 7. Score policy

Baseline scores are recorded in DEBT-465 Part 2's Verification checklist when the owner runs the adoption baseline; thereafter this doc carries a small per-module baseline table (add it after the first real run — no invented numbers before then). Do not predict thresholds from test counts alone: `grading.ts` and `subscription-write-guard.ts` deliberately sample a 5-test suite and a 21-case table because mutation testing reveals strength or gaps that raw counts cannot.
