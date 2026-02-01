# BUG-003: FakePracticeSessionRepository throws Error instead of ApplicationError

**Status:** Resolved
**Priority:** P0
**Date:** 2026-01-31
**Resolved:** 2026-02-01

## Summary

The `FakePracticeSessionRepository.end()` method throws a plain `Error('NOT_FOUND')` instead of an `ApplicationError`. This causes test expectations to not match real application error handling behavior.

## Location

- **File:** `src/application/test-helpers/fakes.ts` line 210
- **Current:** `throw new Error('NOT_FOUND');`
- **Expected:** `throw new ApplicationError('NOT_FOUND', 'Practice session not found');`

## Impact

- Tests using fakes won't catch error handling regressions
- Production code expects `ApplicationError` with structured codes, but tests validate against plain `Error`
- Error boundary and error mapping logic untested

## Fix

Replace `Error` with `ApplicationError` in all fake repository methods that throw NOT_FOUND.

## Acceptance Criteria

- All fake repository methods throw `ApplicationError` for NOT_FOUND cases
- Error messages match what real Drizzle repositories would return
- Existing tests pass (may need to update assertions)
