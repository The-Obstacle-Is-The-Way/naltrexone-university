# DEBT-500: Vitest 5 Needs a Coordinated Migration

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — filed 2026-10-05; resolution decided below
**Priority:** P3
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

Dependabot opened #1370 on 2026-10-05, bumping `vitest` from 4.1.11 to 5.0.1 on its own. CI's typecheck fails across the browser-mode specs (`*.browser.spec.tsx`) with `TS2349: This expression is not callable`. The failed mixed-version tree needs a coordinated migration. The compiler error alone does not establish which API change caused it.

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

## Impact

Low today. The repository still installs Vitest 4.1.11; its current lanes are not blocked by this upgrade PR. The longer the migration waits, the further Dependabot's single-package bumps drift from what the lanes can use.

## Options

1. **Merge #1370's lone bump.** Rejected: it fails typecheck.
2. **Group the Vitest packages in `.github/dependabot.yml`,** so one PR moves them together, and do the spec changes in a reviewed migration. Recommended.
3. **Pin Vitest to 4 and ignore majors.** Rejected as a lasting answer: it postpones evaluating supported major upgrades. No upstream end-of-support date for 4 has been established here.

## Resolution (decided)

Option 2, in its own PR when it is next in the queue:
- read the [Vitest 5 migration guide](https://vitest.dev/guide/migration/) and reproduce the incompatible boundary before changing specs;
- group `vitest`, `@vitest/*` and `vitest-browser-react` in Dependabot's configuration;
- migrate the browser specs and lane configuration;
- confirm that every lane passes, coverage maps still merge for CRAP, and Stryker's runner works;
- close #1370 as superseded.

## Verification

Criteria to meet before closing; none is met yet.

- [ ] The first-party Vitest packages use compatible 5.x versions and are grouped in Dependabot. Independently versioned adapters use releases whose peer ranges support that version; they need not be on major 5. Installed `vitest-browser-react` 2.3.0 already declares `vitest: ^4.0.0 || ^5.0.0`. Peer compatibility still needs a passing browser lane.
- [ ] Every lane passes in the full gate.
- [ ] The CRAP report and Stryker run.
- [ ] #1370 is closed as superseded.
