# BUG-190: History Session Reopen Race Applies Stale Result

**Status:** Open
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
1. Hook stores stale token as `latestReviewSessionId` in [use-history-sessions.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/hooks/use-history-sessions.ts:34).
2. Reopen assigns the same token value (`sessionId`) in [use-history-sessions.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/hooks/use-history-sessions.ts:49).
3. Both old and new requests for the same session pass the equality check in [use-history-sessions.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/hooks/use-history-sessions.ts:62) and [use-history-sessions.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/hooks/use-history-sessions.ts:70).
4. Because the token is not per-request, stale same-session responses are not reliably discarded.

## Fix

Not yet implemented.

Expected fix shape:
- Replace sessionId token with a monotonic request id (or composite token) per open action.
- Commit only when response token matches latest request token.

## Verification

- [ ] Unit test added
- [ ] Integration test added
- [x] Manual verification

## Related

- Existing test coverage handles stale responses across different session IDs, but not reopen races on the same session ID.
