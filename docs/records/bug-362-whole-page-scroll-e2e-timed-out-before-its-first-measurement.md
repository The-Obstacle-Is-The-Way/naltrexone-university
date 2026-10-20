# BUG-362: The Whole-Page-Scroll E2E Timed Out Before Its First Measurement

**Status:** Open — the cause is unknown; the scroll helper now names any navigation during its wait. Read the next failure's output; due 2026-11-03
**Priority:** P3
**Date:** 2026-10-20

---

## Summary

`tests/e2e/practice.spec.ts`'s `scrollPageToBottom` polls a `page.evaluate` that scrolls to the bottom and returns the distance left. Once, in a local gate, the tutor test "uses whole-page scroll for long tutor feedback content" failed there, and not one evaluate returned within the poll's 5 seconds. Why the page didn't answer is unknown. The trace was overwritten before anyone read it. The helper now reports any main-frame navigation during its wait, so a recurrence shows whether the page was navigating.

## Evidence

- **The failure.** #1579's local gate on d2af5a9c (2026-10-20, about 14:10Z) failed the tutor test at `scrollPageToBottom` with only "Timeout 5000ms exceeded while waiting on the predicate". #1579 doesn't touch this spec, the helper or the page.
- **No evaluate returned.** Playwright's `expect.poll` keeps the last value its function returned and prints it as `Received:` on timeout. With a poll whose function keeps returning a distance, the runner prints `Received: <n>`. With one whose first `page.evaluate` never returns, it prints exactly the bare line above. Both cases were reproduced in the real runner.
- **Smooth scrolling is not the cause.** `app/globals.css` sets `html { scroll-behavior: smooth }`, so `scrollTo({ behavior: 'auto' })` animates, and a measurement taken right after the call reads where the page was:
  - In a standalone probe (headless Chromium, 375×667, a 4,000 px page), the page was 3,349 px from its bottom right after `'auto'` and 0 px after `'instant'`.
  - The animation took 217 ms for 200 px and 950 ms for 3,349 px.
  - A repeated call does not restart it.
  - With `'auto'`, the poll still passed in about 1.9 s, even with the CPU throttled up to 20× or the main thread busy 900 of every 920 ms.
  - A slow animation would print a `Received` distance, not the bare timeout.
- **Rare.** In the five failed CI runs whose logs include this test (39370814142, 39082100756, 38179571095, 38104070586 and 36288924739), it passed each time, in 3.3 to 5.0 s. This local gate is the only failure on record.

## Impact

Tests only. When it happens, it costs an investigation and a rerun. The helper serves the tutor test and three exam-mode tests in the same spec. The app's scrolling is unaffected.

## Options

1. **Make the next failure diagnosable.** *Chosen.* On timeout, the helper names each main-frame navigation during its wait, by path only, beside the original error. A navigation would point to the signed-in session's Clerk handshakes (BUG-333, BUG-337); none would point to a blocked page.
2. **Retry or lengthen the poll.** That would hide a page that stopped answering, and the E2E policy allows no retries.
3. **Do nothing until it recurs.** The next failure would be no more explainable than this one.

## Resolution (in progress)

Option 1. With it, the helper scrolls with `behavior: 'instant'`, which overrides the page's smooth scrolling. Each measurement then reads where its own call left the page, and the poll passes on its first call instead of after about 1.9 s. That change makes the measurement precise; it is not the fix for this failure.

## Verification

- [ ] If the test fails at the helper again, its error names the navigations, or "none", and this record is updated with them.
- [ ] By the due date, if it hasn't recurred, decide whether to close the record or keep it open as a watch.

## Related

- BUG-333 and BUG-337: Clerk cookie rewrites and aborted requests in signed-in E2E, one candidate if the helper names a navigation.
