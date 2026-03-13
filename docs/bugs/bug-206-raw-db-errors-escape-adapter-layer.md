# BUG-206: Raw DB Errors Escape Adapter Layer via `throw error` Fallback

**Status:** Invalidated (false positive)
**Priority:** ~~P1~~ N/A
**Date:** 2026-03-13

## Summary

In `drizzle-practice-session-repository.ts:191` and `drizzle-attempt-repository.ts:213`, catch blocks check for a specific Postgres unique-violation constraint and re-throw all other errors raw.

## Invalidation Reason

**Tracer-bullet verification revealed an outer catch in the controller layer that handles this.**

The `createAction` wrapper in `src/adapters/controllers/create-action.ts:40-49` wraps every use case execution in a try/catch. The `handleError` function in `src/adapters/controllers/action-result.ts:32-62` is the safety net:

1. `ApplicationError` -> maps to structured `ActionResult`
2. `ZodError` -> maps to `VALIDATION_ERROR`
3. **Any other unknown error** (including raw Postgres errors) -> logs `'Unhandled error in controller'` and returns `err('INTERNAL_ERROR', 'Internal error')`

Raw errors thrown from repositories **never escape to the caller**. They are caught by `createAction`, logged, and converted to a safe `ActionResult`. The two flagged repositories simply let the controller layer handle the wrapping instead of doing it at the repository level -- a minor inconsistency in error-message specificity, not a contract violation.
