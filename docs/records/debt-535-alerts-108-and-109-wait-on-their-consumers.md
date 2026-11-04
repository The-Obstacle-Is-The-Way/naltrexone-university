# DEBT-535: Alerts #108 and #109 Wait on Sentry's and Stryker's Releases

**Status:** Open — update `@sentry/nextjs` once Sentry's release with getsentry/sentry-javascript#26014 is past the 7-day gate, or re-date the check; due 2026-11-12
**Priority:** P3
**Date:** 2026-11-04

---

## Summary

Dependabot opened alerts #108 (`glob`, [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)) and #109 (`minimatch`, [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)), both moderate, on 2026-11-01. Each fix ships only in a new major, `glob` 14.0.2 and `minimatch` 11.0.1, published 2026-10-27, and no package here accepts those majors yet. Neither advisory is reachable here. This record decides not to override the consumers onto the new majors.
- **#108** closes with Sentry's next release, which has merged the change.
- **#109** closes only with a Stryker major upgrade, which DEBT-500's runner patch already holds.

## Evidence

- **Where they come from.**
  - `glob` 13.0.6 comes only through `@sentry/bundler-plugins` 11.9.0, which declares `^13.0.6`, under `@sentry/nextjs` and `@sentry/node`.
  - `minimatch` 10.2.6 comes through that `glob` (`^10.2.2`) and through `@stryker-mutator/core` 9.6.1 (`~10.2.4`).
  - `pnpm audit` reports these two advisories and no others.
- **What each advisory needs.**
  - In `glob`, an aborted walk goes on reading directories. That matters only to a caller that bounds a walk with `signal`.
  - In `minimatch`, a crafted pattern multiplies its parts, and the work then grows quadratically. That needs an attacker's pattern and `optimizationLevel` 2 or more. The default is 1, and the fix changes only the level-2 preprocessing.
- **Sentry's plugin never runs here.**
  - Its `glob` helper has three callers: the source-map upload search, the delete-after-upload search and the Rollup plugin's output scan. None passes a `signal`.
  - `glob` sets `optimizationLevel` 2 for `minimatch`, but only on these repository-set patterns.
  - The plugin runs only through `withSentryConfig` or `@sentry/node`'s bundler entry points (`./webpack`, `./vite`, `./rollup`, `./esbuild`). Nothing in the repository imports either, and `next.config.ts` has no Sentry build step.
  - A production build's output holds no `glob` or `minimatch` code. The name appears only in a comment inside source maps.
- **Stryker's copy cannot reach the vulnerable code.**
  - Its three `minimatch` calls pass `dot`, `flipNegate` and `nocase`, or nothing, so they run at the default level 1.
  - The patterns are the `mutate` and `ignorePatterns` lists in `stryker.config.json`.
  - Stryker runs in the weekly Mutation workflow and on `pnpm test:mutation`, a report that never gates a pull request (ADR-019).
- **No fix will reach the installed majors.**
  - On isaacs/minimatch#333 (2026-11-01), the maintainer says the fix cannot be backported and treats every version before 11 as unsupported.
  - isaacs/node-glob#664 asks for a `glob` 13 backport of the cancellation fix. It has been open since 2026-11-02, with no reply. A 13.x release would fit Sentry's `^13.0.6`.
- **The new majors are a rewrite, a week old.**
  - `minimatch` 11 matches each part of a path with a matcher from a new package, `@isaacs/nonrecursive-glob-match`, first published 2026-10-26, instead of a regular expression.
  - It removes `makeRe()`, `Minimatch#regexp` and the `AST` class, and changes what `partial` matching and an empty path part match.
  - `glob` 14 moves to it and to `path-scurry` 3, renames `Pattern` methods, and changes where an `ignore` pattern that starts with `/` begins.
  - From 2026-10-26 to 11-02 the four packages shipped 14 releases: `glob` 14.0.0 to 14.0.3, `minimatch` 11.0.0 to 11.0.4, the matcher 1.0.0 to 1.0.3, and `path-scurry` 3.0.0.
- **Upstream.**
  - **Sentry.** getsentry/sentry-javascript#25969 asked for `glob` 14. #26014 made the change, merged into `develop` on 2026-11-03.
    - It also fixed a Windows path that `glob` 14 broke, and added a test of the upload patterns.
    - The latest release, 11.10.0 (2026-10-28), still declares `^13.0.6`.
  - **Stryker.** 10.1.1 (2026-10-23) still declares `minimatch` `~10.2.4`.
    - Its Renovate dashboard (stryker-js#3515) lists the `minimatch` 11 and `glob` 14 updates as waiting.
    - This repository pins Stryker at 9.6.1, and DEBT-500's runner patch keeps Dependabot from opening that update. So any Stryker release carrying `minimatch` 11 reaches this tree only through the major upgrade DEBT-500's watch triggers.

## Impact

Nothing reaches users or production. Two moderate alerts stay open beside any real ones until the consumers move. #109 can stay open for months.

## Options

1. **Override `glob` 13 to 14 and `minimatch` 10 to 11.** This closes both alerts now. It forces both consumers outside their declared ranges, as the `esbuild` override already does for `drizzle-kit`, but onto the week-old rewrite.
   - Sentry needed code changes to move: the Windows path in #26014.
   - Stryker's ignore rules use `partial` matching and paths with a trailing slash, the two behaviors `minimatch` 11 changes.
   - All for no reachable benefit.
2. **Override Sentry's `glob` alone.** `glob` 14.0.3 is past the 7-day gate. That would close #108 about a week before Sentry's release does, at the cost of an override outside Sentry's range to remove afterwards.
3. **Dismiss #109 against this record.** `docs/policies/supply-chain.md` (Audit hygiene) allows this only once the owner explicitly approves. Until then the alert stays open with the record linked.
4. **Watch Stryker's `minimatch` 11 change in the upstream fix watch.** There is no upstream issue or fix pull request to watch yet. DEBT-500's watch already triggers the Stryker upgrade, which is the only route to the fix.
5. **Keep both alerts open and close each with its consumer's release (chosen).**

## Resolution (decided)

- **No override.** Both alerts stay open, with this record as their reason.
- **#108, on the due date.**
  - If Sentry's release carrying #26014 has cleared the 7-day gate, update `@sentry/nextjs` in a repo-owned bundle. That removes `glob` 13 and Sentry's copy of `minimatch` 10, so #108 closes as fixed.
  - If no such release exists, re-date the status to its publish date plus 7 days. A `glob` 13.x release with the fix (isaacs/node-glob#664) would also close #108.
- **#109.** Once #108 closes, close this record with a Waiting row for #109.
  - It revives with DEBT-500's Stryker upgrade, raised by the upstream fix watch.
  - That upgrade must take a Stryker release declaring `minimatch` `>=11.0.1`, which shows on stryker-js#3515 and in Stryker's release notes.
  - If the wait proves open-ended, the owner decides on option 3.
- **If a path becomes reachable,** for example a Sentry build step or a glob pattern taken from input, reconsider option 1 for that path at once.

## Verification

- [ ] The `@sentry/nextjs` update leaves no `glob` 13 in the lockfile, and Dependabot marks #108 fixed on `main`.
- [ ] #109 is fixed, or carried by its Waiting row with DEBT-500's trigger.

## Related

- DEBT-500: Stryker's runner patch, whose upgrade is #109's only route to the fix.
- DEBT-476 § F, closed by DEBT-506: an earlier advisory left open until upstream upgraded.
- DEBT-517: replaced the direct dependencies behind alerts #77 and #81, after rejecting waiting with them open.
