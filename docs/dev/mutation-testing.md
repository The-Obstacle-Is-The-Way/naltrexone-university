# Mutation Testing (StrykerJS)

**Last Updated:** 2026-08-13

Mutation testing audits the **tests**, not the code: Stryker seeds small, realistic faults ("mutants" — `<=` → `<`, `&&` → `||`, deleted statements, flipped booleans) into production source, runs the test suite against each, and reports which mutants the suite **killed** (a test failed) versus which **survived** (every test still passed). A surviving mutant is a behavior change no test noticed. The **mutation score** = detected ÷ valid mutants.

Coverage says a line was *executed*; mutation says its behavior is *pinned*. In a repo where agents write most tests under a TDD mandate, this is the mechanical audit that the tests actually constrain behavior — the "mutation hardening" step of the swarm-forge discipline. The repo has already done this by hand once: the DEBT-423 resolution verified its test rewrite with "temporary mutation checks proved red-on-behavior plus green-on-refactor." Stryker automates exactly that. Adopted by `docs/adr/adr-019-test-quality-practices.md`; tracked as DEBT-465 Part 2.

---

## 1. Tooling and compatibility

```bash
pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner
```

- StrykerJS 9.6.x; the Vitest runner peer-accepts `vitest >= 2.0.0`, gained Vitest 4 support in 9.4.0, and fixed per-mutant hit counts/coverage for Vitest 4.1 in 9.6.1 — we run Vitest 4.1.x. Keep Stryker current; the runner tracks Vitest majors closely.
- The runner **enforces per-test coverage analysis internally** (`coverageAnalysis` is ignored) and by default runs only tests *related* to each mutated file (`vitest.related: true`) — our colocated `foo.ts` → `foo.test.ts` convention is the ideal shape for this.
- **Skip `@stryker-mutator/typescript-checker` for now.** It peer-resolves `typescript`, which in this repo is an npm alias to `@typescript/typescript6` (the TS6 preview build — see DEBT-460's dual-compiler seam). Compile-error mutants are rare in strictly-typed code; revisit the checker only after the TS6/TS7 seam collapses.
- Constraint from the runner: **Vitest Browser Mode is not supported**, and our integration lane is serial against a real shared Postgres. Both lanes are structurally out of scope — see §2.

## 2. Scope policy — mutate only what the unit lane pins

Stryker runs the **unit config** (`vitest.config.ts`). Therefore only files whose behavior is pinned by unit-lane tests (including the acceptance suite from `docs/dev/acceptance-testing.md`, which runs in the same lane and adds business-rule kills) produce meaningful scores. A file covered only by browser or integration tests will report survivors that mean "tested in the wrong lane for Stryker," not "badly tested" — keep such files out of `mutate` until that changes.

Never mutate: `src/**/test-helpers/**` (fakes/factories are test support), `src/application/ports/**` (type-only interfaces), barrels.

## 3. Configuration

`stryker.config.json` at the repo root:

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "testRunner": "vitest",
  "vitest": { "configFile": "vitest.config.ts" },
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
  "incremental": true,
  "incrementalFile": ".stryker-tmp/incremental.json",
  "reporters": ["clear-text", "progress", "html", "json"],
  "htmlReporter": { "fileName": "reports/mutation/index.html" },
  "thresholds": { "high": 90, "low": 75, "break": null },
  "tempDirName": ".stryker-tmp"
}
```

- **`"break": null` is policy, not an oversight.** Coverage-adjacent metrics are observational in this repo (`docs/dev/react-vitest-testing.md`); `high`/`low` only color the report. Introducing a breaking gate requires an ADR amending ADR-019 with measured baselines.
- `incremental: true` makes re-runs mutate only what changed — this is what keeps the loop usable day-to-day.
- Add `.stryker-tmp/` and `reports/` to `.gitignore` in the adoption PR.
- Add a script: `"test:mutation": "stryker run"`. Focused loop while fixing one module: `pnpm exec stryker run --mutate src/domain/services/grading.ts`.
- If the sandbox copy (`.stryker-tmp`) ever breaks a path-dependent test, prefer narrowing `mutate`/test selection over `--inPlace` (in-place mutates your working tree during the run).

## 4. Pilot targets (baseline wave)

Chosen 2026-08-13 for consequence-per-minute: pure, fast, unit-tested, and expensive to get wrong. All run in milliseconds under the unit lane.

| Target | Why it's first | Mutants most likely to teach us something |
|---|---|---|
| `src/domain/services/subscription-write-guard.ts` (56 loc, 21 table-driven tests) | Five sequential boolean early-returns deciding whether a different Stripe identity may overwrite a stored entitled subscription — the highest-consequence pure function in the domain: a survivor here means a paying customer can be silently downgraded. The pilot audits whether the table's cases actually pin each early-return | Boolean/conditional flips per early-return |
| `src/domain/services/entitlement.ts` | The paid-product gate; `currentPeriodEnd <= now` boundary + 4-way reason ladder | Equality-boundary (`<=` → `<`) — does any test pin the expiry *instant*? |
| `src/domain/services/grading.ts` (5 tests) | The most consequential function in a medical-exam product, thinly tested | `!== 1` correct-choice invariant, id-equality flips |
| `src/domain/services/exam-timer.ts` | Expiry boundary (`>=`) and `max(0, floor(...))` — the BUG-254 class of bug | Equality/arithmetic at the deadline |
| `src/domain/services/statistics.ts` | `computeStreak`'s today-guard and `day -= 1` walk; accuracy clamp | Arithmetic/equality survivors are likely |
| `src/domain/services/shuffle.ts` + `src/application/shared/shuffled-choice-views.ts` | Determinism *is* the contract (stable per-user choice order). Tests that only assert "is a permutation" will let bit-twiddling mutants survive — a genuine finding | Arithmetic/bitwise in Mulberry32; `i === j` guard |
| `src/application/shared/persist-subscription-observation.ts` | Retry-loop bounds + version-conflict discriminator; wrong = infinite webhook retries or lost writes | `<=`/`===` on attempt counters |
| `src/application/use-cases/validate-feedback-context.ts` (15 tests) | Security boundary (BUG-260, cross-user data attachment) with a compound negated clause — the single most mutation-worthy expression in the app layer | Negation/`&&`-`\|\|` mutants in the ownership ladder |

Second wave once the pilot is triaged: `src/domain/services/session-stats.ts`, `src/domain/value-objects/subscription-status.ts`, `src/application/use-cases/start-practice-session.ts`, `src/adapters/controllers/shared/idempotency-error-policy.ts` (a unit-pinned adapter policy), then `src/domain/**` wholesale, then `src/application/{use-cases,shared}/**`.

## 5. Triage — what each survivor means

Work the HTML report per file; classify every survivor:

1. **Missing assertion / boundary test** (the common case) → write the unit test that kills it. This is TDD debt made visible; the fix is a red test, not config.
2. **Equivalent mutant** (provably identical behavior) → suppress narrowly with a justification:
   ```ts
   // Stryker disable next-line EqualityOperator: `<` and `<=` equivalent here — set is deduplicated above
   ```
   Suppressions without a stated reason are review-rejectable.
3. **Dead code** → delete the code, not the mutant.
4. **Wrong-lane pin** (behavior is actually pinned by a browser/integration test) → remove the file from `mutate`, or move/duplicate the pinning test into the unit lane if it belongs there.
5. **`NoCoverage` mutants** → the file isn't unit-covered at all; cross-check the CRAP report (`docs/dev/code-quality-metrics.md`) and decide test-or-descope explicitly.

Timeouts count as detected. **Do not chase 100%** — equivalent mutants exist and suppression-spam is worse than an honest 92. The goal is a per-module ratchet: record the baseline, never regress it, raise it when you touch the module.

## 6. Cadence and CI

Mutation runs are minutes-per-module, not seconds — they do **not** enter the per-PR pipeline initially.

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
          with: { path: .stryker-tmp/incremental.json, key: stryker-${{ hashFiles('pnpm-lock.yaml') }} }
        - run: pnpm exec stryker run
        - uses: actions/upload-artifact@<pinned-sha>
          with: { name: mutation-report, path: reports/mutation }
  ```

  Pin actions following `ci.yml`'s conventions (`actions/checkout` and `pnpm/action-setup` are SHA-pinned there; `setup-node`/`upload-artifact` ride major tags). The run **reports; it does not gate** (`break: null`). Once runtimes and baselines are known, a per-PR incremental variant scoped to changed files (`--mutate` from the diff) can be evaluated — via ADR, like any gate.

## 7. Score policy

Baseline scores are recorded in DEBT-465 Part 2's Verification checklist when the pilot first runs; thereafter this doc carries a small per-module baseline table (add it after the first real run — no invented numbers before then). Interpretation guide: domain services should sit ≥ 90 quickly given their test density; `grading.ts` scoring low on the first run is the *expected, valuable outcome* — its thin suite is why it's in the pilot. `subscription-write-guard.ts` is the opposite bet: 21 table-driven cases whose real bite the mutants will audit.
