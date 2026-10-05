# ADR-020: Coverage Stays a Patch-Level Signal, Not a Per-Lane Threshold

**Status:** Accepted
**Date:** 2026-09-26
**Decision Makers:** Owner (decided by the owner's delegate at the owner's direction, 2026-09-26)
**Depends On:** ADR-003 (Testing Strategy), ADR-019 (Test Quality Practices)

---

## Context

[DEBT-468](../_archive/debt/debt-468-test-estate-coverage-and-fixture-debt.md) Part 4 proposed per-lane Vitest `coverage.thresholds` just below the measured floors (unit statements 82 / branches 78; browser and integration pinned after a re-measure), plus `coverage.include` globs so unimported files are measured. The goal was regression-proofing, not target-chasing, and ADR-019 requires a new ADR before any numeric metric gates CI.

Three facts decide the question:

1. **A patch-level coverage gate already exists.** Every hosted run uploads unit, integration and browser coverage to Codecov. Codecov's default `codecov/patch` status has no target configured, so it uses `auto`: the coverage of a PR's changed lines must not fall below the base commit's (96.89% on `main` at 2026-09-26). Codecov posted it on each of the 13 PRs from #1129 to #1141, including docs-only ones. Both merge tools refuse any posted check that is not green: `scripts/merge-reviewed-pr.ts` for features and `scripts/verify-promotion.ts` for promotions. So a change whose measured patch coverage falls below the base target cannot merge. Uncovered lines can still pass while the patch as a whole stays above the target. That is the regression-proofing Part 4 wanted, applied to the code a change touches, which is where regressions enter.
2. **The per-lane floors would sit far below that bar and measure the wrong thing.** A unit floor of 82% statements trips only after a large, repository-wide decline that `codecov/patch` would already have refused change by change. Lane floors also depend on which lane happens to import a file, so moving a test between lanes (as DEBT-472 moved behavior to Postgres) can trip a floor with no loss of verification.
3. **Coverage cannot show that tests catch defects.** In this repository, strength is shown by mutating the code under test and watching a named case fail, which every DEBT-469/468/472 increment records. DEBT-465 Part 2's mutation pilot is the measured version of that practice. A percentage reached by executing lines without asserting on them passes any threshold. The adversarial review of 2026-09-26 found exactly such a test (F4), written to cover inert callbacks.

## Decision

1. **No per-lane `coverage.thresholds` and no project-level coverage target.** DEBT-468 Part 4's floors are declined, and Part 4 closes on this record.
2. **`codecov/patch` stays as it is, and is now documented as a gate.** It keeps the default `auto` target. Both merge tools require a successful `codecov/patch` check by name, so a missing status blocks a merge just as a failed one does. That matters because CI uploads with `fail_ci_if_error: false`: a failed upload leaves no status rather than a red one. (The by-name requirement landed in the next change to the tools, on 2026-09-27; until then they refused the status only when it was posted and not green.) This ADR adds no Codecov configuration. Changing the target, or making the status informational, needs a new ADR.
3. **Coverage stays a diagnostic everywhere else.** Use it to find untested code and to prove an extracted helper is exercised. Assertion strength is judged by mutation evidence: named break-it proofs per change now, and DEBT-465's pilot when the owner starts it.
4. **Unimported files remain unmeasured by design.** Vitest 4 measures loaded files only. A runtime file no test imports is caught by review and by `codecov/patch` only once a test loads it. Adding `coverage.include` for every runtime source would make coverage a completeness gate, which point 1 declines.

## Consequences

- One coverage rule applies to every change: its measured patch coverage must not fall below the base target. There is no second, weaker floor to maintain.
- A PR whose measured patch coverage falls below the base target fails `codecov/patch` and cannot merge. This has already shaped work: extracted test helpers are made fully coverable before a split (DEBT-469).
- `docs/dev/react-vitest-testing.md`'s rule that coverage is observational now carries one stated exception: `codecov/patch` binds through the merge tools.
- Revisit this record if Codecov stops posting `codecov/patch` on every PR, or if DEBT-465's mutation pilot shows that patch coverage is passing tests that catch no defects.

## Amendment: PRs with nothing to measure (2026-09-28)

The revisit condition above occurred. Under the owner's 2026-09-19 ruling, Dependabot PRs run every lane except E2E, without secrets. So their Codecov upload has no token, and `codecov/patch` never posts. The first batch under this record, #1187–#1191, could not merge.
- **The rule.** `scripts/merge-reviewed-pr.ts` excuses a **missing** `codecov/patch` only when both hold:
  - the PR's changed-file list is complete;
  - every changed path is `package.json`, `pnpm-lock.yaml` or under `.github/`.
- **Why it holds.** Coverage measures none of those paths, so the gate's invariant, that measured patch coverage must not fall below the base target, holds vacuously.
- **What it does not relax.**
  - A posted `codecov/patch` must still succeed.
  - A truncated file list, or any other changed path, still requires it.
  - Promotions carry secrets, so `scripts/verify-promotion.ts` still requires it by name on every promotion, including one that promotes dependency updates.
  - The target and the gate's binding status are unchanged.


## Amendment: documentation, configuration and Codecov outages (2026-10-05)

Codecov's `*.codecov.io` certificate expired at 2026-10-04 23:59:59 UTC while its status page reported no incident. No coverage reached Codecov for about nine hours.
- **What happened.** #1362 changed only documentation and `.coderabbit.yaml`. It waited about eight hours for a `codecov/patch` that would have measured nothing, while CI showed green ([DEBT-497](../debt/debt-497-codecov-outage-blocks-merges-behind-green-ci.md)).
- **The rule.** The excused paths gain Markdown documentation (`*.md`) and repository-tool configuration (`.coderabbit.yaml`, `codecov.yml`). The reasoning is the 2026-09-28 amendment's: coverage measures none of these, so the invariant holds vacuously.
- **Visibility.** CI's upload step now fails on an upload error without failing the job (`continue-on-error`), and the next step reports it as a job warning and summary. The guard, not CI, decides whether a missing status blocks.
- **What it does not relax.**
  - A posted `codecov/patch` must still succeed.
  - A change to any measured path still waits for it.
  - Promotions still require it by name.

## Related

- [ADR-019](./adr-019-test-quality-practices.md), the binding observational posture this refines
- [DEBT-468](../_archive/debt/debt-468-test-estate-coverage-and-fixture-debt.md) Part 4, closed by this record
- [DEBT-465](../debt/debt-465-test-quality-practices-adoption.md), mutation testing as the measure of assertion strength
- `scripts/merge-reviewed-pr.ts`, `scripts/verify-promotion.ts` (`test` and `codecov/patch` required green by name)
