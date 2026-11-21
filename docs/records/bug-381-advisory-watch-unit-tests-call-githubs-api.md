# BUG-381: Advisory-Watch Unit Tests Call GitHub's API Through `gh`

**Status:** Open — make the advisory database a required argument and give every test a fake, red first; due 2026-11-24
**Priority:** P3
**Date:** 2026-11-17

---

## Summary

Eight calls in `scripts/watchers/upstream-advisory-watch.test.ts`, covering twelve tests, pass `raiseUpstreamAdvisories` no fourth argument, so they get the default `githubAdvisoryDatabase()`, which runs `gh api advisories?ghsa_id=…` synchronously. Five of those calls, eight tests, reach it. Each makes a live GitHub API call with whatever `gh` credentials the machine has, takes about 250 ms instead of a millisecond, and blocks its worker for up to `gh`'s 30-second timeout when GitHub is slow, failing the test's 10-second limit.

## Evidence

- **The default.** `raiseUpstreamAdvisories(advisories, dependencies, issues, database = githubAdvisoryDatabase(), …)` (`scripts/watchers/upstream-advisory-watch.mts:283-288`). Its `find` runs `run(['api', \`advisories?ghsa_id=${ghsaId}\`])` (`:724-737`), with `createGhRunner({ timeout: 30000, … })` (`:511`), which calls `execFileSync` (`scripts/lib/github-cli.mts:15`).
- **The calls.** Lines 55, 78 (two cases), 86, 104, 135, 157, 204 (four cases) and 242 pass three arguments; lines 40, 180 and 219 pass a fake. Of the eight, 55, 78 and 242 return before the lookup (an advisory before the watch's start, an existing issue, a failed issue list); the other five reach `gh`.
- **The failures.** CI run 43892882549 on 2026-11-16 (head 2bab5483), attempt 1: test 84 took 11.2 s; attempt 2 passed. The local full gate on 2026-11-17 (head a6dbb267): test 84 took 30,008 ms, `gh`'s timeout. Run alone, the eight tests that reach `gh` take 225 to 330 ms, the others a millisecond, and the whole file passed five times in five.

## Impact

- A slow GitHub answer fails `pnpm test` and CI's required `test` check, which blocks merges and promotions.
- Unit tests reach the network with real credentials and send fixture advisory IDs to GitHub, spending the token's rate limit.

## Resolution (decided)

Decided by the reviewing session on 2026-11-17, at the owner's delegation.

- Make `database` a required parameter of `raiseUpstreamAdvisories`, and of `watchUpstreamAdvisories` (`:880`), which has the same default, so the compiler rejects a call without one. Their production callers (`:915`, `:949`) already pass their own.
- Give each call that lacks one a fake from `upstream-advisory-watch-test-helpers.ts`: `unreviewed` (`:91`), which answers "not found", or `reviewedAs` (`:105`).
- The guard is the compiler. Red first: a test line marked `// @ts-expect-error` calls the function without a database, so `pnpm typecheck` fails if the parameter becomes optional again.

## Verification

- [ ] `pnpm typecheck` passes with the `@ts-expect-error` line, and fails once the default is restored.
- [ ] With a `gh` stub on `PATH` that writes a marker file, the advisory-watch test files pass and the marker stays absent. A missing `gh` proves nothing, since `raiseUpstreamAdvisories` catches the lookup's error.

## Related

BUG-344 (the watch's earlier `gh` handling).
