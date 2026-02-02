# BUG-021: Practice Sessions Never Started/Ended — Dead Session Controller Code

**Status:** Resolved
**Priority:** P2 - Medium
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary

Practice session start/end server actions existed, but there was no UI flow that created a session, ran a session by `sessionId`, or ended a session with a summary.

## Root Cause

The app only had filter-based practice at `/app/practice` and never invoked `startPracticeSession()` / `endPracticeSession()` from the UI.

## Fix

1. Added a "Start a session" UI to `/app/practice` that calls `startPracticeSession()` and navigates to `/app/practice/[sessionId]`.
2. Added `/app/practice/[sessionId]` session runner page that:
   - Loads questions via `getNextQuestion({ sessionId })`
   - Submits attempts via `submitAnswer({ sessionId, ... })`
   - Ends sessions via `endPracticeSession()` and shows a summary
3. Added render-output unit tests for the new session runner page.

## Verification

- [x] Unit tests added/updated (`app/(app)/app/practice/page.test.tsx`, `app/(app)/app/practice/[sessionId]/page.test.tsx`)
- [x] `pnpm test --run`

## Related

- `src/adapters/controllers/practice-controller.ts`
- `src/domain/services/session.ts` — computeSessionProgress (unused)
- SPEC-013: Practice Sessions
