# BUG-086: Session History Drill-Down Race Can Show Wrong Session Details

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The session-history drill-down fetch does not guard against out-of-order responses. If a user opens session A, then quickly opens session B, session A's slower response can overwrite the detail panel while B remains selected.

## Steps to Reproduce

1. Open the practice page and go to session history.
2. Click session A, then quickly click session B.
3. Simulate A response arriving after B.

**Observed:** `selectedHistorySessionId` points to B, but `selectedHistoryReview` can be replaced by A.

**Expected:** Only the response for the latest selected session should update the detail state.

## Root Cause

`onOpenSessionHistory` sets selected session ID before awaiting the fetch, but commits response unconditionally:

- `app/(app)/app/practice/hooks/use-practice-session-history.ts:78-107`

No request nonce/session-id equality check exists before calling:
- `setSelectedHistoryReview(res.data)`
- `setHistoryReviewLoadState({ status: 'ready' })`

## Impact

- Incorrect session breakdown shown to users.
- Misleading review context when analyzing completed sessions.

## Fix

`usePracticeSessionHistory` now tracks the latest requested session ID and
discards stale response commits for earlier selections:

- `app/(app)/app/practice/hooks/use-practice-session-history.ts`

Added regression coverage:

- `app/(app)/app/practice/hooks/use-practice-session-history.test.tsx`
  - overlapping `onOpenSessionHistory` calls
  - newer selection resolves first
  - stale older response resolves later and is ignored

## Verification

- [x] Test that two overlapping requests cannot let the stale one overwrite state
- [ ] Manual rapid-click verification in session history panel

## Related

- `app/(app)/app/practice/hooks/use-practice-session-controls.ts`
- `app/(app)/app/practice/components/practice-session-history-panel.tsx`
