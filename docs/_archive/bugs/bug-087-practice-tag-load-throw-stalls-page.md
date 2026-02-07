# BUG-087: Practice Tag Load Throw Leaves Page Stuck in Loading

**Status:** Resolved
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

Wrapped initial tag loading in `usePracticeSessionControls` with `try/catch`
and transitioned thrown failures to the existing error state:

- `app/(app)/app/practice/hooks/use-practice-session-controls.ts`

Added regression coverage:

- `app/(app)/app/practice/hooks/use-practice-session-controls.test.tsx`
  - `getTags` throw now produces `tagLoadStatus: 'error'`
  - hook no longer hangs in loading on rejected tag load

## Verification

- [x] Hook test where `getTags` throws and `tagLoadStatus` becomes `'error'`
- [x] Hook test where successful call still sets `'idle'` and rows
- [ ] Manual verification by forcing server-action failure

## Related

- `app/(app)/app/practice/page.tsx`
- `src/adapters/controllers/tag-controller.ts`
