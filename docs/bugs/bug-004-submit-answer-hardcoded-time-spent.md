# BUG-004: SubmitAnswer use case hardcodes timeSpentSeconds to 0

**Status:** Open
**Priority:** P2
**Date:** 2026-01-31

## Summary

The `SubmitAnswer` use case always records `timeSpentSeconds: 0` for every answer attempt, regardless of actual time spent.

## Location

- **File:** `src/application/use-cases/submit-answer.ts` line 52
- **Current:** `timeSpentSeconds: 0`
- **Expected:** Should accept time from client or calculate from session/question start time

## Impact

- Time-spent analytics completely broken
- Pacing analysis impossible
- Study session duration tracking inaccurate
- Cannot identify which questions take longest

## Root Cause

Placeholder implementation that was never completed. The use case input doesn't include a `timeSpentSeconds` field.

## Fix

1. Add `timeSpentSeconds: number` to `SubmitAnswerInput` interface
2. Pass client-measured time through from the frontend
3. Validate reasonable bounds (0 < time < 3600 seconds)

## Acceptance Criteria

- Use case accepts `timeSpentSeconds` from caller
- Time is persisted to attempt record
- Validation prevents unreasonable values
- Tests cover time tracking
