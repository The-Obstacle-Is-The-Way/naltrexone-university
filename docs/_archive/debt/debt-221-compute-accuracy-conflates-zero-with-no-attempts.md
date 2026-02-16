# DEBT-221: `computeAccuracy()` Conflates "No Attempts" With "0% Accuracy"

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-16
**Resolved:** 2026-02-16
**GitHub Issue:** —

---

## Summary

`computeAccuracy(total, correct)` returns `0` when `total <= 0`. This is **intentional** (SPEC-003 + `src/domain/services/statistics.test.ts` assert “0 for no attempts”), but it created a presentation problem: UI percent formatting couldn’t distinguish “no attempts yet” from “0% correct.”

## Resolution

Kept domain behavior unchanged and updated the presentation layer to render `—` when the denominator is 0:

- Dashboard accuracy cards: `app/(app)/app/dashboard/page.tsx`
  - Overall accuracy uses `stats.totalAnswered`
  - 7-day accuracy uses `stats.answeredLast7Days`
- Session history: `app/(app)/app/history/components/history-sessions-tab.tsx` (uses `row.answered`)
- Session summary: `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` (uses `summary.totals.answered`)

This also guarantees we never render `NaN%`/`Infinity%` because accuracy is only formatted when the denominator is > 0.

## Tests

- Updated `app/(app)/app/dashboard/page.test.tsx`
- Updated `app/(app)/app/history/components/history-sessions-tab.test.tsx`
- Added `app/(app)/app/practice/[sessionId]/components/session-summary-view.test.tsx`

## Notes

- The alternative breaking fix (returning `null` from `computeAccuracy`) was intentionally avoided to preserve SPEC-003 and existing domain tests.

