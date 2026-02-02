# BUG-020: Missing Review/Missed Questions Page — Dead Controller Code

**Status:** Resolved
**Priority:** P2 - Medium
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary

The review controller (`getMissedQuestions`) was fully implemented but never called from any page. Users could not review missed questions in the UI.

## Root Cause

The app had a working controller and container wiring, but there was no Next.js route/page using it (missing `/app/review` page and navigation).

## Fix

1. Added `/app/review` page that calls `getMissedQuestions({ limit, offset })`.
2. Added pagination via `limit`/`offset` search params and basic empty/error states.
3. Added navigation link to `/app/review` (desktop + mobile nav).
4. Added render-output unit tests for the new page.

## Verification

- [x] Unit tests added (`app/(app)/app/review/page.test.tsx`)
- [x] `pnpm test --run`

## Related

- `src/adapters/controllers/review-controller.ts`
- SPEC-014: Review and Bookmarks
- BUG-019: Missing Bookmarks View Page (similar pattern)
