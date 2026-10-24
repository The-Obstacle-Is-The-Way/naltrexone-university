# BUG-370: Scheduled Jobs Hide Why a gh Call Failed

**Status:** Open
**Priority:** P3
**Date:** 2026-10-24

---

## Summary

The scheduled GitHub jobs call `gh` through `createGhRunner` (`scripts/lib/github-cli.mts`), which DEBT-532 part 2 (#1603) added on 2026-10-24. It passes `stdio: 'pipe'`, so `gh`'s error line is kept on the thrown error and no longer printed. The calls it replaced set no `stdio`, and Node then copies the child's error output to the job log. A runner test pins the new behavior, and the runner's comment leaves diagnostics to each caller.

Five callers print a fixed line, so after the next promotion a failed run will say that it failed but not why. `documentation-due-checks.ts` gives the reason for the fixed line: other failures can carry a GitHub credential.

- `scripts/watchers/security-txt-renewal.mts`: "security.txt renewal check failed; inspect the file and GitHub issue access."
- `scripts/watchers/operational-alert-watcher.ts`: "Operational alert watcher failed; inspect GitHub issue access."
- `scripts/watchers/upstream-advisory-watch.mts`: a fixed line for any failure except a spent rate limit, and per-item lines ("Could not open or close issues for: …", "Could not read GitHub’s review of: …", "Could not read advisories for: …") that name only the advisory or repository.
- `scripts/records/documentation-due-checks.ts`: "Overdue production check failed; inspect the records and GitHub issue access."
- `scripts/review/coderabbit-learnings-review.ts`: "CodeRabbit learnings review failed; inspect GitHub comment and issue access."

`production-release-watch.ts` and `upstream-fix-watch.ts` print the error's message. For a `gh` failure, Node's message includes the command and its error output, so these two keep the cause.

#1560 named the generic line as a follow-up bug and left it unchanged.

## Evidence

- **What main's log shows.** BUG-344 found the advisory watcher's 403s from `gh`'s own lines. Run 38851671722 (2026-10-16) logged `gh: Resource not accessible by integration (HTTP 403)` four times at 04:41:39–40Z, followed by the watcher's "Could not open or close issues for: GHSA-qrxm-fqhp-jwvm, …", which names the wrong step (BUG-344). With the current runner, only the watcher's line would remain.
- **What the runner does now.** `scripts/lib/github-cli.test.ts` runs a fake `gh` that writes to its error output and exits 3. The test asserts that the parent's error output stays empty and that `error.stderr` holds the line.
- **Node's behavior,** checked on Node 24.21.0. `execFileSync` on a child that writes `gh-line` to its error output and exits 3 copies the line to the parent's error output when no `stdio` is given, and copies nothing with `stdio: 'pipe'`.
- **The replaced calls.** Before part 2, `security-txt-renewal.mts`, `upstream-advisory-watch.mts`, `github-alert-issues.ts` and `coderabbit-learnings-review.ts` each called `execFileSync` with no `stdio` option (`git show 36dcd26c^:scripts/<file>`).

## Impact

The loss is diagnostic only: a failing run still exits nonzero and fails its job. Scheduled workflows run `main`'s code, so no run has lost the line yet; the next promotion carries the change. After that, finding a failure's cause takes a separate probe. BUG-344's diagnosis had the line and still needed one.

## Options

1. **Print a value-free reason.** A shared helper beside the runner turns a `gh` failure into its HTTP status (`HTTP 403`) or its transport failure (timed out, output over its limit, `gh` not found, or exit status). Each caller adds the reason to its line, and the advisory watcher adds it beside each advisory or repository it names. An error that did not come from `gh` adds nothing, so the existing value-free tests still hold.
2. **Print `gh`'s error line again,** from the runner or from each caller. This restores exactly what `main` logs today, but it puts GitHub's message text back in the log, which the fixed lines were written to keep out.

## Resolution (decided)

Option 1. A status code or transport failure carries no value, so the callers' rule against printing what might hold a credential still holds without an exception. A status is also the first fact BUG-344's diagnosis needed.

## Verification

- [ ] Each of the five callers names the `gh` status or transport failure in its failure line, and an error that did not come from `gh` still prints the fixed line.
- [ ] The advisory watcher names the reason beside each advisory or repository it reports.
- [ ] Promotion to `main`, whose scheduled runs use the new lines.

## Related

- DEBT-532: the scripts layout whose part 2 added the shared runner.
- BUG-344: the advisory watcher's 403s, found from `gh`'s error lines.
