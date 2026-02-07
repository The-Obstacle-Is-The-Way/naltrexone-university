# BUG-087: Practice Tag Load Throw Leaves Page Stuck in Loading

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The initial tag-loading effect in `usePracticeSessionControls` does not catch thrown errors from `getTags`. If `getTags` rejects (transport failure, server-action execution failure), the promise rejection is unhandled and UI status remains loading.

## Steps to Reproduce

1. Make `getTags({})` throw in `usePracticeSessionControls`.
2. Mount the hook/page.

**Observed:** `tagLoadStatus` stays `'loading'`; no error state/message transition occurs.

**Expected:** Errors should transition to `'error'` state with recoverable UI feedback.

## Root Cause

The tag-loading effect awaits `getTags` without `try/catch`:

- `app/(app)/app/practice/hooks/use-practice-session-controls.ts:99-114`

In contrast, adjacent effects in the same hook already handle thrown errors explicitly (for incomplete sessions), which makes this inconsistency clear.

## Impact

- Practice setup can appear indefinitely loading.
- Thrown errors bypass consistent UI error handling path.

## Fix

Pending.

Recommended approach:
- Wrap `getTags` call in `try/catch`.
- Set `tagLoadStatus` to `'error'` on thrown failures.
- Optionally surface a user-facing error message consistent with other controls.

## Verification

- [ ] Hook test where `getTags` throws and `tagLoadStatus` becomes `'error'`
- [ ] Hook test where successful call still sets `'idle'` and rows
- [ ] Manual verification by forcing server-action failure

## Related

- `app/(app)/app/practice/page.tsx`
- `src/adapters/controllers/tag-controller.ts`
