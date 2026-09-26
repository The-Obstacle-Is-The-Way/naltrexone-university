# ADR-020: Coverage Stays a Patch-Level Signal, Not a Per-Lane Threshold

**Status:** Accepted
**Date:** 2026-09-26
**Decision Makers:** Owner (decided by the owner's delegate at the owner's direction, 2026-09-26)
**Depends On:** ADR-003 (Testing Strategy), ADR-019 (Test Quality Practices)

---

## Context

[DEBT-468](../debt/debt-468-test-estate-coverage-and-fixture-debt.md) Part 4 proposed per-lane Vitest `coverage.thresholds` just below the measured floors (unit statements 82 / branches 78; browser and integration pinned after a re-measure), plus `coverage.include` globs so unimported files are measured. The goal was regression-proofing, not target-chasing, and ADR-019 requires a new ADR before any numeric metric gates CI.

Three facts decide the question:

1. **A patch-level coverage gate already exists.** Every hosted run uploads unit, integration and browser coverage to Codecov. Codecov's default `codecov/patch` status (no target configured, so `auto`: the patch must not fall below the base commit's coverage, 96.89% on `main` at 2026-09-26) reports on every PR. Both merge tools refuse any check that is not green: `scripts/merge-reviewed-pr.ts` for features and `scripts/verify-promotion.ts` for promotions. So a change whose new or changed lines lower coverage cannot merge. That is the regression-proofing Part 4 wanted, applied to the code a change touches, which is where regressions enter.
2. **The per-lane floors would sit far below that bar and measure the wrong thing.** A unit floor of 82% statements trips only after a large, repository-wide decline that `codecov/patch` would already have refused change by change. Lane floors also depend on which lane happens to import a file, so moving a test between lanes (as DEBT-472 moved behavior to Postgres) can trip a floor with no loss of verification.
3. **Coverage cannot show that tests catch defects.** In this repository, strength is shown by mutating the code under test and watching a named case fail, which every DEBT-469/468/472 increment records. DEBT-465 Part 2's mutation pilot is the measured version of that practice. A percentage reached by executing lines without asserting on them passes any threshold. The adversarial review of 2026-09-26 found exactly such a test (F4), written to cover inert callbacks.

## Decision

1. **No per-lane `coverage.thresholds` and no project-level coverage target.** DEBT-468 Part 4's floors are declined, and Part 4 closes on this record.
2. **`codecov/patch` stays as it is, and is now documented as a gate.** It uses the default `auto` target and is enforced through the merge tools' all-checks-green rule. This ADR records that it binds; it adds no configuration. Changing its target, or making it informational, needs a new ADR.
3. **Coverage stays a diagnostic everywhere else.** Use it to find untested code and to prove an extracted helper is exercised. Assertion strength is judged by mutation evidence: named break-it proofs per change now, and DEBT-465's pilot when the owner starts it.
4. **Unimported files remain unmeasured by design.** Vitest 4 measures loaded files only. A runtime file no test imports is caught by review and by `codecov/patch` only once a test loads it. Adding `coverage.include` for every runtime source would make coverage a completeness gate, which point 1 declines.

## Consequences

- One coverage rule applies to every change: its own lines must not lower coverage. There is no second, weaker floor to maintain.
- A PR that adds uncovered code fails `codecov/patch` and cannot merge. This has already shaped work: extracted test helpers are made fully coverable before a split (DEBT-469).
- `docs/dev/react-vitest-testing.md`'s rule that coverage is observational now carries one stated exception: `codecov/patch` binds through the merge tools.
- Revisit this record if `codecov/patch` stops running on every PR, or if DEBT-465's mutation pilot shows that patch coverage is passing tests that catch no defects.

## Related

- [ADR-019](./adr-019-test-quality-practices.md), the binding observational posture this refines
- [DEBT-468](../debt/debt-468-test-estate-coverage-and-fixture-debt.md) Part 4, closed by this record
- [DEBT-465](../debt/debt-465-test-quality-practices-adoption.md), mutation testing as the measure of assertion strength
- `scripts/merge-reviewed-pr.ts`, `scripts/verify-promotion.ts` (all checks green, `codecov/patch` included)
