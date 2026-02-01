# BUG-004: SubmitAnswer use case hardcodes timeSpentSeconds to 0

**Status:** Resolved
**Priority:** P2
**Date:** 2026-01-31
**Resolved:** 2026-02-01

## Summary

The `SubmitAnswer` use case records `timeSpentSeconds: 0` for every answer attempt.

## Location

- **File:** `src/application/use-cases/submit-answer.ts` line 60
- **Current:** `timeSpentSeconds: 0`
- **SSOT:** `docs/specs/master_spec.md` specifies `time_spent_seconds = 0` (fixed for MVP)

## Impact

This is an MVP tradeoff: we defer time tracking until we have a clear client-side timing model.

## Root Cause

By-design per SSOT for MVP.

## Fix

No code change required.

Track future work as debt (time tracking + validation) once the product needs pacing analytics.

## Regression Test

- `src/application/use-cases/submit-answer.test.ts`

## Acceptance Criteria

- The code matches SSOT behavior ✅
- Follow-up tracked as debt for post-MVP ✅
