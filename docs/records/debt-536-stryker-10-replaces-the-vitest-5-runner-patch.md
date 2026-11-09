# DEBT-536: Stryker 10.1.1 Replaces the Vitest 5 Runner Patch

**Status:** Verifying — every check is recorded, and the record closes; due 2026-11-09
**Priority:** P3
**Date:** 2026-11-05

---

## Summary

DEBT-500 closed with a Waiting row: drop the repository's patch to `@stryker-mutator/vitest-runner` 9.6.1 once stryker-js fixed Vitest 5 test-name filtering (stryker-js#6210). The patch made the runner join a test's suite chain with `' > '`, as Vitest 5 filters it. Runner 10.1.0 shipped the fix (stryker-js#6214), and the upstream fix watch raised #1609, so the trigger fired. This record holds that work: the upgrade to Stryker 10.1.1 without the patch, and the last check in #1500.

*Corrected 2026-11-09: the plan to close #1609 by hand gave way to what happened. #1609 and #1500 both closed at promotion #1648's merge, #1500 before its last check ran, which has passed since.*

## Evidence

- **Without the patch, the runner selects nested tests.** On the upgrade branch, a Stryker 10.1.1 run of `src/adapters/controllers/shared/idempotency-error-policy.ts` killed 108 of 108 mutants. #1500 expected 107; Stryker 10's new `CallExpression` mutator adds one, at line 149.
- **The full run matches `main`'s.** The Mutation workflow on the branch scored 99.17% over 3,037 mutants, and its integrity step passed. `main`'s run of 2026-11-02, on 9.6.1 with the patch, scored 99.23% over 3,027. Compared by file, mutator and location, every shared mutant kept its outcome. No mutated file changed between the two runs.
- **The 10 new mutants come from Stryker 10's `CallExpression` mutator.** Eight were killed.
  - One exposed a test gap in `finalize-exam-answers.ts`, which a test now covers: a final flush that clears the selection within the grace window must end the session at the flush, not at the deadline.
  - One removes an unreachable `throw` in `persist-subscription-observation.ts`, and its Stryker comment now marks it equivalent.
  - With those two settled, the survivors are the same 22 as on `main`.
- **The scheduled run on `main` passes.** The Mutation workflow's 2026-11-09 schedule on `main`, whose head contains the upgrade, scored 99.23% over 3,037 mutants, and its integrity step passed.
  - Against `main`'s run of 2026-11-02, all 3,019 shared mutants kept their status.
  - The 18 new entries are the 10 `CallExpression` mutants (9 killed, 1 ignored as equivalent) and 8 earlier mutants at new positions where the code around them moved.
  - The one uncovered mutant, in `get-practice-session-timing.ts`, was also uncovered on 2026-11-02, in an unchanged file.
- **The upgrade also ends the trust-policy exceptions.** It removes Stryker's Babel 7 `@babel/core` tree, the only route to `semver@6.3.1`, and `tinyexec` had already moved past 1.2.2, so both `trustPolicyExclude` entries go. Next's optional `@babel/core` peer moves to Babel 8, and the build still compiles with SWC. Stryker 10 needs Node 22 or later, and CI runs Node 24.

## Impact

Until the upgrade, a patch to a pinned runner held every Stryker update back. The branch's Mutation run matched `main`'s, outcome for outcome, and the first scheduled run of the promoted tree on `main` did too.

## Options

1. **Upgrade to 10.1.1 and drop the patch (chosen).**
2. **Keep 9.6.1 with the patch.** It works, but it holds every Stryker update and keeps the trust-policy exceptions.

## Resolution (decided)

- Upgrade `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` to 10.1.1. Delete the patch, its `patchedDependencies` entry, its test and both `trustPolicyExclude` entries.
- Keep the upstream fix watcher, now with no watch, for future workarounds, as #1500 asks.
- **The last check.** The Mutation workflow's cron runs on Mondays at 06:00 UTC, though GitHub has started recent runs between 12:00Z and 15:00Z. The first scheduled run whose head commit contains the upgrade is due 2026-11-09 at the earliest.
  - If it scores at least 99% and its integrity step passes, close #1500 and this record.
  - If either check fails, keep #1500 open and record the regression and its cause here.
  - If the 2026-11-09 run's head commit does not contain the upgrade, re-date the status to the next Monday.
- **#1500's other boxes.**
  - #1609, the watch's "Upstream fix released" issue, closed when promotion #1648 merged. #1647 targeted `dev`, where a closing keyword does nothing, but #1648's description said "Close #1609 by hand…", and GitHub read that as a closing keyword.
  - #1500 closed at the same merge, because a commit message of #1647's said "close #1500 only if both checks pass". That was before the last check ran. The check has passed since, so both closures stand, and #1500 carries the run's evidence in a comment.
  - #1500 asks for the mutation-testing guide's runner bullet to be removed. It was rewritten instead, to describe the fixed runner, because the guide still needs to say that the runner's test-name filter must match Vitest's. The Waiting row is removed.

## Verification

- [x] Without the patch, the upgrade branch kills 108 of 108 mutants in `idempotency-error-policy.ts`.
- [x] The Mutation workflow on the branch passes its integrity step, and every mutant shared with `main`'s last run keeps its outcome.
- [x] The first scheduled Mutation run on `main` after the upgrade scores at least 99%, and its integrity step reports no survivor that ran none of its covering tests. The 2026-11-09 run scored 99.23%, and its integrity step passed.
- [x] #1609 is closed once the upgrade reaches `main`. It closed when #1648 merged, on 2026-11-05.

## Related

- DEBT-500: the closed record whose Waiting row this record carries.
- DEBT-535: the `minimatch` advisory. This upgrade does not fix it, because Stryker 10.1.1 still declares `minimatch` `~10.2.4`.
