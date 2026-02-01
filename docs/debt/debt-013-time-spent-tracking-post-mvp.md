# DEBT-013: Time Spent Tracking Deferred (MVP Uses `time_spent_seconds = 0`)

**Status:** Open
**Priority:** P3
**Date:** 2026-02-01

## Summary

Per SSOT (`docs/specs/master_spec.md`, SubmitAnswer behavior), attempts currently persist `time_spent_seconds = 0` for MVP. This keeps the system simple but prevents pacing analytics.

## Impact

- No meaningful "time per question" analytics
- No session duration metrics derived from attempts
- Cannot identify questions that consistently take longer

## Suggested Implementation (Post-MVP)

1. Define an explicit timing model (client-measured vs server-measured).
2. Add a `timeSpentSeconds` field to the SubmitAnswer controller input schema (Zod).
3. Validate reasonable bounds (e.g., `0..3600`).
4. Persist `time_spent_seconds = timeSpentSeconds`.
5. Add unit tests for input validation + persistence and an integration test for DB persistence.

## Acceptance Criteria

- SubmitAnswer persists a non-zero `time_spent_seconds` when provided
- Validation rejects unreasonable values
- Tests cover behavior end-to-end (use case + repository integration)
