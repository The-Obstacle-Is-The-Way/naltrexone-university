# BUG-356: The Records Tests Skip Their Ledger-Line, Status and Queue-Review Checks

**Status:** Open — assert the three findings on the live tree through one shared blocking list, red first
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

`scripts/documentation-archive.ts` audits the records. Three of its findings never fail a test: a malformed ledger line, a record status it does not recognize, and an unreadable queue-review date. Only its command line fails on them, and nothing runs the command. So a malformed ledger line or a status such as "Pending" passes `pnpm test` and CI. The weekly due-check job reports a bad queue-review date, but only after merge.

## Evidence

- **Only the command fails on them.** `runDocumentationCommand` exits 1 on `malformedLedgerLines`, `invalidStatus` and `invalidQueueReview` (`documentation-archive.ts:755-775`).
  - No package script, workflow or hook runs the command; only its own test spawns it.
- **The live-tree tests skip them.** `tests/documentation-archive.test.ts` and `tests/documentation-records.test.ts` assert every other blocking field of the live audit. They test these three only on synthetic input (`tests/documentation-records.test.ts:48`, `:66`, `:95`).
- **The weekly job catches only the date, and only later.** `documentation-due-checks.ts:77-82` throws on an unreadable queue-review date, after merge.
- **The records rules rely on the check.** The records index says "the guard checks receipt shape" for every ledger line ("Closing", step 3).
- **The tree is clean today.** On 2026-10-18 the command exited 0 on the live tree.

## Impact

The check the records rules rely on for ledger receipts and statuses does not run in CI, so a malformed entry can merge unnoticed.

## Options

1. **Assert the three fields in the live-tree tests**, one line each.
2. **Export one list of blocking findings** that both the command and a single live-tree test use, so a field added later cannot be left out again. The unused command can then go (DEBT-532).

## Resolution (proposed)

Option 2, with option 1 as its first step.

## Verification

- [ ] Live-tree tests fail on a malformed ledger line, an unrecognized status and an unreadable queue-review date (shown red with a temporary edit), and pass on the real tree.
- [ ] The command and the tests share one list of blocking findings.

## Related

- DEBT-532: the scripts audit that found this.
- DEBT-518: the records layout these checks enforce.
- BUG-339: this suite's timing in CI.
