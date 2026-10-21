# BUG-339: The Register Budget Test Can Time Out in CI's Coverage Run

**Status:** Verifying — every check is recorded, and the record closes; due 2026-10-22
**Priority:** P3
**Date:** 2026-10-12

---

## Summary

`tests/documentation-register-budget.test.ts` checked the byte budgets of the records index and the frozen register files. Each case ran the full documentation audit, which parses every file's Markdown for links. The at-budget case fed it five files, about 1 MB in all, and the audit parsed about 1.6 MB of Markdown, because it parsed some files twice. Under CI's coverage run it took the case past Vitest's 10-second limit, and any pull request could fail on it.

*Corrected 2026-10-13: DEBT-518 step 5 deleted the frozen register files and their budget, so the test checks only the records index's budget, and the full audit parses each file once, apart from the records index, which it parses twice.*

## Evidence

- **The failure.** #1465's CI on 2026-10-12 (run 38217589321) failed "accepts register files at their budgets and ignores other large files" with `Test timed out in 10000ms`. #1465 does not touch the guard or the test. Another session found it and traced the cost.
- **Always close to the limit.** In "Unit tests with coverage", the file took 4.0 to 10.6 s in every CI run checked since 2026-10-08, against 0.7 s locally without coverage. That run was the only such failure among the 27 failed CI runs since 2026-10-01. The test failed twice more the same day, after this fix was written: on #1470 (run 38230303349, 10.3 s) and on #1472's first attempt (run 38231553954).
- **Locally, under coverage:** the at-budget case took 3.5 s, and the three others 0.1 to 0.15 s each.
- **Why so much parsing.** The budget check is in `auditRecordLifecycle`, which parses only the index. `auditDocumentation` adds a link parse of every file, and at filing it parsed each live file twice: once for record links and once for broken links.

## Impact

CI only: a red pull request, the cause written up, and a re-run, about 20 minutes each time. Production code is unaffected.

## Options

1. **Test the budget on `auditRecordLifecycle`, which owns it,** and keep one small case showing the full audit reports it. *Chosen:* the test stops parsing megabytes in order to check a byte count.
2. **Raise the test's timeout.** It hides the cost, and the runner's variance would still grow into the new limit.
3. **Shrink the test files.** A budget test needs files at the budget.
4. **Parse each file once in `auditDocumentation`.** This halves the guard's cost, but the test would still parse about 1 MB. Not needed for this bug.

## Resolution (decided)

Option 1. The budget cases call `auditRecordLifecycle`, and one new case requires `auditDocumentation` to report an oversized index. The index case now uses 11,000 "€" characters: under 32 KiB as characters, over it as bytes (33,000).

## Verification

- [x] Under coverage locally, the file's tests take 0.15 s instead of 3.9 s (2026-10-12).
- [x] Five mutations each fail the tests: counting characters instead of bytes, rejecting a file at its budget, dropping the archive budget, budgeting the whole records folder, and the full audit dropping the result (2026-10-12).
- [x] Promoted to `main` by #1474 on 2026-10-12. Every CI run on `main` since, through 2026-10-21, passed with its coverage run, apart from one manual run on 2026-10-16 that DEBT-523's guard refused on purpose.

## Related

- BUG-336: the last unit-test timeout that made CI flaky.
- DEBT-518 owns the documentation guard.
