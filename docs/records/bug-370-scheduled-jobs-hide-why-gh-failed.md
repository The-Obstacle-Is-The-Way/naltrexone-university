# BUG-370: Scheduled Jobs Hide Why a gh Call Failed

**Status:** Verifying — promotion to main, then a passing run of each changed job; due 2026-11-07
**Priority:** P3
**Date:** 2026-10-24

---

## Summary

The scheduled GitHub jobs call `gh` through `createGhRunner` (`scripts/lib/github-cli.mts`), which DEBT-532 part 2 (#1603) added; it merged to `dev` on 2026-10-24. The runner passes `stdio: 'pipe'`, so `gh`'s error output stays on the thrown error and is no longer printed. The eight calls it replaced set no `stdio`: seven direct `execFileSync('gh', …)` calls and `verify-promotion.ts`'s shared runner, which still runs `git` that way. Without `stdio`, Node copies a child's error output to the job log. A runner test pins the new behavior, and the runner's comment leaves diagnostics to each caller.

Five callers print a fixed line, so after the next promotion a failed run will say that it failed but not why:

- `scripts/watchers/security-txt-renewal.mts`: "security.txt renewal check failed; inspect the file and GitHub issue access."
- `scripts/watchers/operational-alert-watcher.ts`: "Operational alert watcher failed; inspect GitHub issue access."
- `scripts/watchers/upstream-advisory-watch.mts`: a fixed line for any failure except a spent rate limit, and per-item lines ("Could not open or close issues for: …", "Could not read GitHub’s review of: …", "Could not read advisories for: …") that name only the advisory or repository.
- `scripts/records/documentation-due-checks.ts`: "Overdue production check failed; inspect the records and GitHub issue access."
- `scripts/review/coderabbit-learnings-review.ts`: "CodeRabbit learnings review failed; inspect GitHub comment and issue access."

The other callers keep the cause. `production-release-watch.ts` and `upstream-fix-watch.ts` print the error's message, which for a `gh` failure is Node's `Command failed: gh <arguments>` followed by `gh`'s error output. `merge-reviewed-pr.ts` and `verify-promotion.ts` leave the error uncaught, so Node prints that message.

The fixed lines' catches are bare `catch {}` with no comment, and so are the advisory watcher's per-item catches. AGENTS.md allows a bare catch only for a suppressed secondary failure. #1560 named the generic line as a follow-up bug and left it unchanged.

## Evidence

- **What main's log shows.** BUG-344 diagnosed the advisory watcher's 403s from `gh`'s own lines in four runs on 2026-10-14 and 2026-10-15; its evidence table counts them. A recurrence on 2026-10-16 logged `gh: Resource not accessible by integration (HTTP 403)` four times, then the watcher's "Could not open or close issues for: GHSA-qrxm-fqhp-jwvm, …", which names the wrong step (BUG-344). With the current runner, only the watcher's line would remain.
- **What the runner does now.** `scripts/lib/github-cli.test.ts` runs a fake `gh` that writes to its error output and exits 3. The test asserts that the parent's error output stays empty and that `error.stderr` holds the line.
- **Node's behavior,** checked on Node 24.21.0. `execFileSync` on a child that writes `gh-line` to its error output and exits 3 copies the line to the parent's error output when no `stdio` is given, and copies nothing with `stdio: 'pipe'`. `error.stderr` holds the output either way.
- **`gh`'s error formats,** checked with gh 2.101.0. A failed `gh api` call writes `gh: Not Found (HTTP 404)` to its error output and GitHub's JSON body to its standard output. A failed `gh issue list` writes `GraphQL: Could not resolve to a Repository with the name '…'. (repository)`, with no status. A bad token gives `HTTP 401: Bad credentials (https://api.github.com/graphql)` on the first line and a sign-in hint on the second. The issue commands these jobs use go through GraphQL.

## Impact

The loss is diagnostic only: a failing run still exits nonzero and fails its job. Scheduled workflows run `main`'s code, so no run has lost the line yet; the next promotion carries the change. After that, finding a failure's cause takes a separate probe.

## Options

1. **Print only the HTTP status or transport failure.** It carries less text, but a GraphQL error, such as a refused issue write, has no status, so it would report only an exit status. It also depends on parsing a message format that `gh` does not document.
2. **Each fixed line adds `gh`'s first error line.** A shared helper beside the runner returns Node's code for a transport failure (`ETIMEDOUT`, `ENOBUFS`, `ENOENT`), which wins over any partial output. Otherwise it returns the first non-empty line of `error.stderr`, capped in length. For any other error it returns nothing, and the line stays as it is. The advisory watcher keeps each reason beside the advisory or repository it reports. `main` logs every error line, including those of handled failures; this logs the one that explains a failure, beside the job's own line.
3. **Drop `stdio: 'pipe'`,** so Node copies every error output again. It is the smallest change, but it also prints `gh` output for failures the code handles on purpose, such as a 404 from a repository the advisory watcher has stopped watching. Printed as a lump, the lines also cannot be matched to the advisory or repository each one concerns.

## Resolution (decided)

Option 2. It restores the cause in each job's own line, and it depends on no particular message format, so GraphQL errors stay visible.

**Why this is safe to print.** The fixed lines exist because an arbitrary error can carry anything; `documentation-due-checks.ts` says such failures can carry a GitHub credential. The helper never prints an arbitrary error's message. It reads only `gh`'s own error output, which `main` logs whenever a `gh` call fails. `gh` does not print its token, and Actions masks the job's `GH_TOKEN`. The cap keeps a long response out of the log.

The catches that report a reason name the error they read, so none of them stays a bare `catch {}`.

Implemented as `withGhFailureReason` and `ghFailureReason` in `scripts/lib/github-cli.mts`. The runner marks each error it throws, and the helper reads only a marked error. A rethrown `git` failure or a hand-built error therefore prints no reason, whatever its shape. In order, the reason is:

- the transport code;
- the signal that killed `gh`;
- `gh`'s first error line;
- the exit status, when `gh` wrote no error output.

A failure line reads `<fixed line> Cause: <reason>`, and an advisory or repository reads `<ID> (<reason>)`. A direct repository that GitHub cannot find reads `<repository> (not found)`. An advisory whose review fails both while raising and while closing is named once. The pull request also fixes a stale owner in `scripts/README.md` that #1604's review found: content-boundary work stays with BUG-351, which carries DEBT-531's decisions.

## Verification

- [x] The helper is tested through `createGhRunner` with a fake `gh`. A REST error, a GraphQL error and a two-line error each give their first line. A timeout, an output overflow and a missing executable each give their code, and a timeout's code wins over output written before it. A kill by signal and a silent exit give the signal and the exit status. An error the runner did not throw gives nothing, even one shaped like `gh`'s, and an overlong line is capped (2026-10-24).
- [x] Each of the five callers prints the reason after its fixed line for a `gh` failure, and only the fixed line for any other error. The existing value-free tests and the advisory watcher's 404 and rate-limit handling keep passing (2026-10-24).
- [x] The advisory watcher names the reason beside each advisory or repository it reports. It names a missing direct repository as not found, and names an advisory once (2026-10-24).
- [ ] Promotion to `main`, followed by a passing scheduled or dispatched run of each changed job; due 2026-11-07. A hosted run that prints a failure line is claimed only once one has run.

## Related

- DEBT-532: the scripts layout whose part 2 added the shared runner.
- BUG-344: the advisory watcher's 403s, found from `gh`'s error lines.
