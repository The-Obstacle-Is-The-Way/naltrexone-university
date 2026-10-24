# BUG-356: The Records Tests Skip Their Ledger-Line, Status and Queue-Review Checks

**Status:** Verifying — promotion to main; due 2026-10-26
**Priority:** P3
**Date:** 2026-10-18

---

The Summary, Evidence and Impact describe audit baseline `0680cb2d`, before this fix; Resolution describes the implementation in this PR.

## Summary

`scripts/documentation-archive.ts` audits the records. Three findings have synthetic tests but no assertion against the live repository: a malformed ledger line, a record status it does not recognize, and an unreadable queue-review date. The CLI fails on them, but no package script, workflow or hook invokes it as a repository gate. A malformed ledger line or a status such as "Pending" can therefore pass `pnpm test` and CI.

## Evidence

- **The command blocks all three.** `runDocumentationCommand` exits 1 on `malformedLedgerLines`, `invalidStatus` and `invalidQueueReview` (`documentation-archive.ts:755-775`).
  - No package script, workflow or hook runs the command; only its own test spawns it.
- **The live-tree tests skip them.** `tests/documentation-archive.test.ts` and `tests/documentation-records.test.ts` assert every other blocking field of the live audit. They test these three only on synthetic input (`tests/documentation-records.test.ts:48`, `:66`, `:95`).
- **The weekly job catches the date.** `documentation-due-checks.ts:77-82` throws on an unreadable queue-review date. Its schedule reads the default branch, so new records reach that automatic check after promotion; workflow dispatch and a local dry-run can check earlier.
- **The records rules rely on the check.** The records index says "The guard checks receipt shape" for every ledger line ("Closing", step 3).
- **The tree is clean today.** On 2026-10-18 the command exited 0 on the live tree.

## Impact

The check the records rules rely on for ledger receipts and statuses does not run in CI, so a malformed entry can merge unnoticed.

Corrected 2026-10-18: distinguish synthetic tests from live assertions, automated gates from manual CLI use, and scheduled checks from dispatch.

## Options

1. **Assert the three fields in the live-tree tests**, one line each.
2. **Export one list of blocking findings** that both the command and a single live-tree test use. Keep explicit negative controls for the required findings: equality between two consumers alone can preserve a shared omission. Retaining or deleting the manual CLI is a separate decision after gate parity (DEBT-532).

## Resolution

Implemented option 2. The command and live lifecycle test share all 18 blocking fields. An independent assertion requires every audit field except counts and the two scheduled-date reports; three sole-finding fixtures protect the original omissions. Link checks remain per document: a consolidated test took 8.2 seconds under coverage against its 10-second limit, so that slower design was rejected. The restored coverage run passed with its slowest case at 603 ms.

Corrected 2026-10-19: bind reproduction claims to the audited baseline and record the red-first implementation, passing local gate and remaining final-sync verification.

## Verification

- [x] Live-tree tests fail on a malformed ledger line, an unrecognized status and an unreadable queue-review date (shown red with a temporary edit), and pass on the real tree.
- [x] The command and the tests share one list of blocking findings.

## Related

- DEBT-532: the scripts audit that found this.
- DEBT-518: the records layout these checks enforce.
- BUG-339: this suite's timing in CI.
