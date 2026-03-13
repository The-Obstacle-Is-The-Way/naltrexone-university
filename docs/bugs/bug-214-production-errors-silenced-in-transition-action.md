# BUG-214: `runTransitionedAsyncAction` Dev-Only Error Logging

**Status:** Open
**Priority:** P4 (downgraded from P2 after verification)
**Date:** 2026-03-13

## Summary

In `question-flow-actions.ts:139-146`, `runTransitionedAsyncAction` catches errors from `input.run()` and only logs them when `NODE_ENV === 'development'`.

## Verification Notes

Tracer-bullet verification revealed this is **by design and low risk**:

- **All callers handle their own errors internally.** Verified:
  - `use-practice-session-question-flow.ts:186` passes `submitAnswerForQuestion` which has its own try/catch at line 209 that calls `setLoadState({ status: 'error', message: ... })`.
  - `use-practice-question-answer-flow.ts:139` -- same pattern.
  - `question-page-logic.ts:283` -- same pattern via `runSubmitAnswerFlow`.
- The outer catch in `runTransitionedAsyncAction` is a **last-resort safety net** for truly unexpected errors that bypass the inner error handling. In practice, this catch should almost never fire.
- The dev-only logging is a deliberate design choice: surface unexpected failures during development; prevent unhandled rejection crashes in production.
- The proper fix (adding `Sentry.captureException` in this safety net) is already tracked by **DEBT-286** (client-side error reporting).

Downgraded from P2 to P4: intentional defense-in-depth that should rarely fire. The missing Sentry integration is tracked separately.

## Location

- `app/(app)/app/practice/shared/question-flow-actions.ts:139-146`

## Suggested Fix

When DEBT-286 is implemented, add `Sentry.captureException(error)` in this catch block alongside the dev `console.error`.
