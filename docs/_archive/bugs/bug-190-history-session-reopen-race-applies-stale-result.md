# BUG-190: History Session Reopen Race Applies Stale Result

**Status:** Fixed
**Priority:** P3
**Date:** 2026-03-03

---

## Description

`useHistorySessions` stale-response guard is keyed only by `sessionId`. Closing and quickly reopening the same session allows an older in-flight response to be treated as current.

Observed behavior:
- If request A (`s1`) is in flight, user closes `s1`, reopens `s1` (request B), then A can still update state because token is again `s1`.

Expected behavior:
- Only the latest request instance should be able to commit, even for the same `sessionId`.

## Steps to Reproduce

1. Open session `s1` under slow network.
2. Before it resolves, click `s1` again to close.
3. Immediately click `s1` to reopen.
4. If first request resolves after reopen, stale result/error can overwrite current state.

## Root Cause

Tracer-bullet path:
1. Hook stores stale token as `latestReviewSessionId` in [use-history-sessions.ts](../../../app/(app)/app/history/hooks/use-history-sessions.ts#L34).
2. Reopen assigns the same token value (`sessionId`) in [use-history-sessions.ts](../../../app/(app)/app/history/hooks/use-history-sessions.ts#L49).
3. Both old and new requests for the same session pass the equality check in [use-history-sessions.ts](../../../app/(app)/app/history/hooks/use-history-sessions.ts#L62) and [use-history-sessions.ts](../../../app/(app)/app/history/hooks/use-history-sessions.ts#L70).
4. Because the token is not per-request, stale same-session responses are not reliably discarded.

## Fix

Replaced `latestReviewSessionId` ref (sessionId-based guard) with a monotonic `latestRequestId` counter. Each `onOpenSession` call increments the counter; only the latest request ID can commit state. This prevents same-session reopen races because each request gets a unique, monotonically increasing token.

## Verification Notes (Audit #11)

**Confirmed real.** Verified at line level 2026-03-03.

Additional severity note: The race is worse than just "stale data." A stale ERROR response also passes the guard (same sessionId token), potentially overwriting a successful fresh response with an error message. Sequence: Request A fires → user closes s1 → user reopens s1 → Request B fires → B succeeds (sets data) → A's error handler fires → guard passes (token is still 's1') → error overwrites success.

## Verification

- [x] Unit test added (browser spec)
- [ ] Integration test added
- [x] Manual verification
- [x] Code-level tracer-bullet verified (Audit #11, 2026-03-03)

## Related

- Existing test coverage handles stale responses across different session IDs, but not reopen races on the same session ID.
