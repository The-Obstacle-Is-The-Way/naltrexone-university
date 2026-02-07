# BUG-094: Exam Review Error State — Misleading "Try Again" Ends Session

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-07

---

## Description

In the review-load error branch, the UI label `Try again` previously invoked end-session behavior.

## Root Cause

Review-error controls were coupled to `onEndSession` instead of retrying review fetch:

- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` (pre-fix)

## Impact

Users could terminate their session while intending to retry review loading.

## Fix

Split review-error actions into explicit semantics:

- `Try again` -> `onRetryReview`
- `End session` -> `onFinalizeReview` fallback

Wiring and tests:

- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`

## Verification

- [x] Review error shows both `Try again` and `End session`
- [x] `Try again` now triggers retry path, not termination path
- [x] Browser spec asserts both controls and handlers
- [x] Full regression suite passed (`pnpm typecheck && pnpm lint && pnpm test --run`)

## Related

- `docs/_archive/bugs/bug-090-practice-error-state-missing-escape-hatch.md`
