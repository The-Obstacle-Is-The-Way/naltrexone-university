# DEBT-535: The `glob` Alert and the `minimatch` Advisory Wait on Sentry's and Stryker's Releases

**Status:** Open — update `@sentry/nextjs` once Sentry's release with getsentry/sentry-javascript#26014 is past the 7-day gate, or re-date the check; due 2026-11-12
**Priority:** P3
**Date:** 2026-11-04

---

## Summary

Dependabot opened alerts #108 (`glob`, [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)) and #109 (`minimatch`, [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)), both moderate, on 2026-11-01. Each fix ships only in a new major, `glob` 14.0.2 and `minimatch` 11.0.1, published 2026-10-27, and no package here accepts those majors yet. Neither advisory is reachable here. This record decides not to override the consumers onto the new majors.
- **#108** closes once a repo-owned `@sentry/nextjs` update takes Sentry's release carrying getsentry/sentry-javascript#26014, after that release clears the 7-day gate. On 2026-11-04 Sentry had merged the change but not released it. A `glob` 13.x backport (isaacs/node-glob#664) would also close #108, but only once the advisory's range is amended to exclude that release.
- **The `minimatch` advisory** stays reported, and any alert Dependabot raises again for it stays open, until the lockfile takes both the `@sentry/nextjs` update and a Stryker release whose `minimatch` range resolves to 11.0.1 or later. Stryker has not published such a release.
- **#109 was withdrawn.** GitHub edited the `minimatch` advisory at 2026-11-04T16:50Z and then withdrew alert #109. The edit changed its range to `>= 7.0.0, < 11.0.1`.
  - The advisory still covers the installed 10.2.6, and `pnpm audit` still reports it.
  - At 17:11Z Dependabot had not raised it again, so this record names it by its advisory.

*Corrected 2026-11-04: the record first tied the `minimatch` alert to DEBT-500's Stryker upgrade, which keeps `minimatch` 10. It also said that no fix would reach the installed majors, that a `glob` 13.x backport would close #108 without an amendment to the advisory's range, and that Sentry's change fixed a Windows path that `glob` 14 broke. GitHub has since withdrawn #109 and changed the advisory's range to `>= 7.0.0, < 11.0.1`.*

## Evidence

- **Where they come from.**
  - `glob` 13.0.6 comes only through `@sentry/bundler-plugins` 11.9.0, which declares `^13.0.6`, under `@sentry/nextjs` and `@sentry/node`.
  - `minimatch` 10.2.6 comes through that `glob` (`^10.2.2`) and through `@stryker-mutator/core` 10.1.1 (`~10.2.4`).
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
- **No fix has reached the installed majors.**
  - On isaacs/minimatch#333 (2026-11-01), the maintainer says the fix cannot be backported and treats every version before 11 as unsupported.
  - isaacs/node-glob#664 asks for a `glob` 13 backport of the cancellation fix. It has been open since 2026-11-02, with no reply.
    - A 13.x release would fit Sentry's `^13.0.6`.
    - It would close #108 only once the advisory's range, `>= 9.0.0, <= 14.0.1`, is amended to exclude it.
- **The new majors are a rewrite, a week old.**
  - `minimatch` 11 matches each part of a path with a matcher from a new package, `@isaacs/nonrecursive-glob-match`, first published 2026-10-26, instead of a regular expression.
  - It removes `makeRe()`, `Minimatch#regexp` and the `AST` class, and changes what `partial` matching and an empty path part match.
  - `glob` 14 moves to it and to `path-scurry` 3, renames `Pattern` methods, and changes where an `ignore` pattern that starts with `/` begins.
  - From 2026-10-26 to 11-02 the four packages shipped 14 releases: `glob` 14.0.0 to 14.0.3, `minimatch` 11.0.0 to 11.0.4, the matcher 1.0.0 to 1.0.3, and `path-scurry` 3.0.0.
- **Upstream.**
  - **Sentry.** getsentry/sentry-javascript#25969 asked for `glob` 14. getsentry/sentry-javascript#26014 made the change, merged into `develop` on 2026-11-03.
    - In `@sentry/bundler-plugins` it changed only the range and added a test. It also fixed an older Windows path bug in `@sentry/react-router`, which is not installed here.
    - The latest release, 11.10.0 (2026-10-28), still declares `^13.0.6`.
  - **Stryker.** 10.1.1 (2026-10-23) still declares `minimatch` `~10.2.4`.
    - Its Renovate dashboard (stryker-mutator/stryker-js#3515) lists the `minimatch` 11 and `glob` 14 updates as waiting.
    - This repository pins Stryker at 10.1.1. Dependabot has never opened a Stryker update here, so the registry check in the Waiting trigger below is the trigger, not Dependabot.
    - DEBT-500's watch raised #1609 on 2026-10-26 for the runner fix in 10.1.1. That upgrade, now made, keeps `minimatch` 10, so it does not fix this advisory.

## Impact

Nothing reaches users or production. #108 stays open beside any real alerts until Sentry moves, or until the lockfile takes a `glob` 13.x backport that the advisory's amended range excludes. The `minimatch` alert, once raised again, can stay open for months.

## Options

1. **Override `glob` 13 to 14 and `minimatch` 10 to 11.** This closes #108 and clears the `minimatch` advisory now. It forces both consumers outside their declared ranges, as the `esbuild` override already does for `drizzle-kit`, but onto the week-old rewrite.
   - Stryker's ignore rules use `partial` matching and paths with a trailing slash, the two behaviors `minimatch` 11 changes.
   - All for no reachable benefit.
2. **Override Sentry's `glob` alone.** `glob` 14.0.3, published 2026-10-28T04:08Z, cleared the 7-day gate at 2026-11-04T04:08Z. An override now would close #108 at least 7 days sooner than Sentry's route, which starts only once Sentry publishes. The cost is an override outside Sentry's range, to remove afterward.
3. **Dismiss the `minimatch` alert against this record,** if Dependabot raises it again. `docs/policies/supply-chain.md` (Audit hygiene) allows this only once the owner explicitly approves. Until then the alert stays open with the record linked.
4. **Watch Stryker's `minimatch` 11 change in the upstream fix watch.** No upstream issue or fix pull request will close when it lands: stryker-mutator/stryker-js#3515 is a dashboard that stays open. The registry check in the Waiting trigger below covers it instead.
5. **Wait for each consumer's release: #108 stays open and the `minimatch` advisory stays reported (chosen).**

## Resolution (decided)

- **No override.** #108 stays open, and so does the `minimatch` alert once raised again, with this record as their reason.
- **#108, on the due date.**
  - If Sentry's release carrying getsentry/sentry-javascript#26014 has cleared the 7-day gate, update `@sentry/nextjs` in a repo-owned bundle. That removes `glob` 13 and Sentry's copy of `minimatch` 10, so #108 closes as fixed.
  - If the release is published but has not cleared the gate, re-date the status to its npm publish date plus 7 days.
  - If it is not published, re-date the status by 7 days, to 2026-11-19, and check again then.
  - A `glob` 13.x release with the fix (isaacs/node-glob#664) closes #108 only if the advisory's range is amended to exclude it. Check both on each due date.
- **The `minimatch` advisory.** Once #108 closes, close this record with a Waiting row for GHSA-g3hv-75wg-m249.
  - Its trigger is an `@stryker-mutator/core` release whose `minimatch` range resolves to 11.0.1 or later in the lockfile. `npm view @stryker-mutator/core dependencies.minimatch` and stryker-mutator/stryker-js#3515 show it.
  - DEBT-500's upgrade (#1609) does not meet it, because 10.1.1 declares `~10.2.4`.
  - If #108 closed through the `glob` 13.x backport instead, Sentry's `glob` 13 still brings `minimatch` 10, so the row also waits on the `@sentry/nextjs` update.
  - If Dependabot raises an alert for GHSA-g3hv-75wg-m249 again, it is this one.
  - If the wait proves open-ended, the owner decides on option 3.
- **If a path becomes reachable,** for example a Sentry build step or a glob pattern taken from input, reconsider option 1 for that path at once.

## Verification

- [ ] Dependabot marks #108 fixed on `main`, because the `@sentry/nextjs` update leaves no `glob` 13 in the lockfile, or because the lockfile resolves `glob` to a 13.x release that the advisory's amended range excludes.
- [ ] `pnpm audit` no longer reports GHSA-g3hv-75wg-m249, because the lockfile holds no `minimatch` below 11.0.1, or the Waiting row carries it with the trigger Resolution sets.

## Related

- DEBT-500: Stryker's runner patch, removed by the upgrade to Stryker 10.1.1 (#1609), which still declares `minimatch` `~10.2.4`.
- DEBT-476 § F, closed by DEBT-506: an earlier advisory left open until upstream upgraded.
- DEBT-517: replaced the direct dependencies behind alerts #77 and #81, after rejecting waiting with them open.
