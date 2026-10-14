# DEBT-500: Vitest 5 Needs a Coordinated Migration

**Status:** Verifying — met 2026-10-14: after #1507, a mutation run on `main` scored 99.65%, and every survivor ran tests; due 2026-10-19
**Priority:** P3
**Date:** 2026-10-05
**Resolved:** 2026-10-14
**Verification receipts:** #1478; #1481; #1502; #1507; [Verification](#verification)

*Corrected 2026-10-14: Dependabot's grouped #1451 was not the vehicle. Its typecheck failed, and it closed unmerged once #1478, a repository-owned PR with the same dependency changes, carried the migration.*

*Corrected 2026-10-14: #1478 checked Stryker with a dry run only, which runs the tests but no mutant. The first full run on Vitest 5 scored 3.70%, against 99.65% on Vitest 4, because of a runner bug (stryker-js#6210). A patch to the runner fixes it until a release does; #1500 tracks removing the patch.*

---

## Summary

Dependabot opened #1370 on 2026-10-05, bumping `vitest` from 4.1.11 to 5.0.1 on its own. CI's typecheck fails across the browser-mode specs (`*.browser.spec.tsx`) with `TS2349: This expression is not callable`. `@vitest/browser-playwright` and `@vitest/coverage-v8` stayed at ^4.1.11 (`package.json:93-94`), so the bumped tree mixed majors and needs a coordinated migration. The compiler error alone does not establish which API change caused it.

## Evidence

- **CI run 37315751778 on #1370.** The Typecheck step fails with `TS2349` in, among others:
  - `app/(app)/app/billing/billing-client.browser.spec.tsx`;
  - `app/(app)/app/bookmarks/bookmarks-toast.browser.spec.tsx`;
  - `app/(app)/app/history/components/history-sessions-tab.browser.spec.tsx`.
- **What the upgrade touches.** The repository runs several Vitest lanes, all on one major:
  - unit and integration, under Node;
  - browser, in Chromium through Playwright;
  - Stryker mutation, report-only and weekly;
  - CRAP, coverage maps from every lane.
- **Stryker on Vitest 5.** Two runs of the mutation workflow on `main`, the scheduled one on 2026-10-12 and one dispatched on 2026-10-14, mutated the same 91 files and 2,931 mutants:

  | Run | Vitest | Score | Killed | Timed out | Survived | No coverage | Ignored |
  |---|---|---|---|---|---|---|---|
  | 2026-10-12 | 4 | 99.65% | 2,854 | 30 | 9 | 1 | 37 |
  | 2026-10-14 | 5 | 3.70% | 104 | 3 | 2,786 | 1 | 37 |

  The score is killed plus timed out over every mutant but the ignored ones.

  - **Why mutants survived.** Each of the 2,786 survivors had covering tests and ran none of them. The runner selects a mutant's tests through a `testNamePattern` built from their names, joining each suite chain with a space. Vitest 5 matches the pattern against the chain joined with `' > '` ([migration guide](https://vitest.dev/guide/migration/#testnamepattern-matches-the-joined-full-name), "`testNamePattern` Matches the `>`-Joined Full Name"), so the pattern matches no test inside a `describe`. A top-level test's name has no chain and still matches, but every survivor's covering tests were nested. The 104 kills were static mutants, which run without the filter.
  - **What it was not.** The job passed, because the run reports a score and never fails on one. Runner 10.0.0 has the same bug.

## Impact

Low when filed. The repository then installed Vitest 4.1.11, and #1370 blocked none of its lanes. The longer the migration waits, the further Dependabot's single-package bumps drift from what the lanes can use.

After #1478, the weekly mutation report was wrong. It scored 3.70% for tests that kill nearly every mutant, and nothing flagged it. No gate reads the score (ADR-019), so no merge depended on it.

## Options

1. **Merge #1370's lone bump.** Rejected: it fails typecheck.
2. **Group the Vitest packages in `.github/dependabot.yml`,** so one PR moves them together, and do the spec changes in a reviewed migration. Recommended.
3. **Pin Vitest to 4 and ignore majors.** Rejected as a lasting answer: it postpones evaluating supported major upgrades. No upstream end-of-support date for 4 has been established here.

## Resolution (decided)

Option 2, in its own PR when it is next in the queue:
- read the [Vitest 5 migration guide](https://vitest.dev/guide/migration/) and reproduce the incompatible boundary before changing specs (*done in #1478: `toHaveTextContent` became an exact match that takes no RegExp, and browser locators became exact by default*);
- group `vitest`, `@vitest/*` and `vitest-browser-react` in Dependabot's configuration (*done 2026-10-09 in the quick-wins pull request: one `vitest` group takes their minor, patch and major updates, the routine group excludes them, and `tests/dependabot-config.test.ts` holds both*);
- migrate the browser specs and lane configuration (*done in #1478: every `toHaveTextContent` became `toMatchTextContent`, which keeps Vitest 4's matching, and `vitest.browser.config.mts` sets `locators: { exact: false }`; `.claude/rules/testing-browser.md` says which matcher to use*);
- confirm that every lane passes, coverage maps still merge for CRAP, and Stryker's runner works (*Stryker's runner did not, see Evidence. `patches/@stryker-mutator__vitest-runner@9.6.1.patch` joins the chain with `' > '`, the form upstream's fix PRs #6214 and #6220 use. It changes both copies of the runner's name helper: the runner's own, and the setup file it copies into Stryker's sandbox. `tests/stryker-vitest-test-names.test.ts` fails if the patched filter stops selecting a nested or top-level test. It checks the patched helper, which the proposed upstream fixes reshape, so the test goes or changes with the patch. The patch is keyed to runner 9.6.1, so any runner upgrade fails `pnpm install` with `ERR_PNPM_UNUSED_PATCH` until the patch is dropped or moved. #1500 tracks the removal, and a Stryker run is its proof. Since closing, `mutation.yml` fails a run in which a survivor ran no test, and `upstream-fix-watch.yml` raises an issue for the owner once the upstream fix has landed and a runner release follows it*);
- close #1370 as superseded.

## Verification

All are met.

- [x] The first-party Vitest packages use compatible 5.x versions and are grouped in Dependabot. Independently versioned adapters use releases whose peer ranges support that version; they need not be on major 5. Installed `vitest-browser-react` 2.3.0 already declares `vitest: ^4.0.0 || ^5.0.0`. Peer compatibility still needs a passing browser lane. *Met: `vitest`, `@vitest/browser-playwright` and `@vitest/coverage-v8` are at ^5.0.3, the `vitest` group holds them, and the browser lane passes.*

  *Corrected 2026-10-06: the closing criterion asks for compatible peer ranges, not major 5 everywhere, and the migration first reproduces the incompatible boundary (#1410).*
- [x] Every lane passes in the full gate. *Met in #1478: typecheck, lint, unit, browser, integration, build and E2E, with the same test counts as Vitest 4.*
- [x] The CRAP report runs. *Met 2026-10-14 on Vitest 5: the unit, integration and browser coverage lanes wrote their maps, and the merged report read 506 files and 2,558 functions.*
- [x] Stryker runs. *Locally with the patch, `src/adapters/controllers/shared/idempotency-error-policy.ts` kills 107 of 107 mutants and `src/domain/services/statistics.ts` 29 of 29. On Vitest 5 without it, they killed 28 (all static) and 0; on Vitest 4, all of both. Met 2026-10-14 on `main` after #1507: the run killed 2,856 mutants and timed out 28, of the 2,894 not ignored, and scored 99.65%. Its 9 survivors each ran tests and are the same 9 as on Vitest 4.*
- [x] #1370 is closed as superseded (Dependabot closed it 2026-10-07; the grouped `vitest` update is #1451, opened 2026-10-10).
- [x] On closing, the patch's removal moves to the Waiting table, with #1500 as its trigger. *Done with this record's closing; `upstream-fix-watch.yml` checks the trigger weekly.*

## Related

- [stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210): the runner bug; its fix pull requests are #6214, #6220 and #6247.
- #1500: removing the runner patch once a release fixes the bug.
