# BUG-217: `questionId` Validation Inconsistency -- `string.min(1)` vs `zUuid`

**Status:** Open
**Priority:** P3
**Date:** 2026-03-13

## Summary

In `question-view-controller.ts:103`, the `GetPreviousAttemptInputSchema` validates `questionId` as `z.string().min(1)`, while all other schemas in the codebase validate `questionId` with `zUuid` (UUID format). This allows arbitrary non-UUID strings to pass validation and reach the database query layer.

## Impact

- Defense-in-depth inconsistency: non-UUID `questionId` values bypass format validation.
- While Drizzle parameterizes queries (no SQL injection risk), the inconsistency could allow unexpected query patterns or confusing error messages from the database layer.
- Any future code that assumes `questionId` is always a valid UUID downstream could break.

## Location

- `src/adapters/controllers/question-view-controller.ts:103` -- `questionId: z.string().min(1)`

## Suggested Fix

Change to `questionId: zUuid` to match all other schemas.

## Prevention

- Use a shared `questionId` field definition rather than defining the schema inline each time.
