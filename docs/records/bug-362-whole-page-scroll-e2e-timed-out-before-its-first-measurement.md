# BUG-362: The Whole-Page-Scroll E2E Timed Out Before Its First Measurement

**Status:** Verifying — no recurrence in 181 CI E2E executions since the diagnostic; closes as Accepted, cause unknown, in this pull request; due 2026-11-22
**Priority:** P3
**Date:** 2026-10-20

---

## Summary

`tests/e2e/practice.spec.ts`'s `scrollPageToBottom` (:78) polls a
`page.evaluate` that scrolls to the bottom and returns the distance left. Once,
in a local gate on 2026-10-20, the tutor test "uses whole-page scroll for long
tutor feedback content" (:232) failed there, and not one evaluate returned
within the poll's 5 seconds. The trace was overwritten before anyone read it,
so the cause is unknown. Since #1582 (2026-10-24), a timeout names any
main-frame navigation during the wait. It has not recurred.

## Evidence

- **The failure.** #1579's local gate on d2af5a9c failed the tutor test at the
  helper with only "Timeout 5000ms exceeded while waiting on the predicate". A
  poll whose first `page.evaluate` never returns prints exactly that; one that
  returns prints `Received: <n>`.
- **Not smooth scrolling.** `app/globals.css:198` sets `scroll-behavior:
  smooth`, but a slow animation prints a `Received` distance, not the bare
  timeout. The helper now scrolls with `behavior: 'instant'` (:96-99).
- **No recurrence.** Since #1582 merged, 181 required CI E2E executions have
  completed: 178 passed, so the helper passed at all five call sites. Of the 18
  failed CI E2E attempts since 2026-10-20, none failed at the helper, and no log
  holds "Main-frame navigations while scrolling". The one that failed this test
  (2026-11-03) did so in 259 ms, during that day's Clerk 429 burst.

## Impact

Tests only. The app's scrolling is unaffected.

## Options

1. Make the next failure diagnosable. Done in #1582.
2. Retry or lengthen the poll. That would hide a page that stopped answering.
3. Keep the record open as a watch.

## Resolution (decided)

Option 1, shipped. At its due date the record closes rather than watching: the
failure is self-describing if it returns, since the helper's error names the
navigations and its comment (:79-81) cites BUG-362, which the ledger resolves.
A recurrence files a new bug with that output.

## Verification

- [x] The helper names main-frame navigations on timeout (#1582, 2026-10-24).
- [x] No recurrence by the due date: checked 2026-11-15 across CI, as above.

## Related

- BUG-333 and BUG-337: Clerk handshakes in signed-in E2E, one candidate if the
  helper ever names a navigation.

Corrected 2026-11-15: the helper has five call sites, not four; the lapsed 2026-11-03 decision is made (close as Accepted, cause unknown) after a CI check found no recurrence.
