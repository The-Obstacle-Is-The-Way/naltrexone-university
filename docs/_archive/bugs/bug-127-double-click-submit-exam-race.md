# BUG-127: Double-Click "Submit Exam" Race in Review

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-09
**Resolved:** 2026-02-10

---

## Description

In exam review, the confirmation dialog's "Confirm submit" button could be double-clicked fast enough to trigger `onFinalizeReview()` twice. Server-side idempotency protects correctness, but UX becomes confusing (multiple transitions / errors).

## Root Cause

The confirm handler guarded only on `isPending`, which can lag behind the user's clicks.

## Resolution

- Add a ref-based guard (`isFinalizingRef`) to prevent multiple finalize calls per dialog open.
- Add a warning line in the confirmation dialog when unanswered questions remain.
- Add browser regression coverage for both behaviors.

Key files:

- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`
- `app/(app)/app/practice/[sessionId]/components/exam-review-view.browser.spec.tsx`

## Verification

- `pnpm test:browser`

