# DEBT-021: Choice Ordering Is Duplicated (Repository + Use Case)

**Status:** Open
**Priority:** P4
**Date:** 2026-02-01

## Summary

Choice ordering (`sortOrder`) is currently enforced in more than one place:

- The repository maps and sorts choices when building the domain `Question`.
- The `GetNextQuestionUseCase` sorts again when mapping to output.

This is harmless, but it’s duplicated work and unclear ownership of the invariant “choices are always ordered by sortOrder”.

## Locations

- `src/adapters/repositories/drizzle-question-repository.ts` (sorts mapped choices)
- `src/application/use-cases/get-next-question.ts` (`mapChoicesForOutput` sorts again)

## Proposed Fix

Pick one canonical owner for the invariant and delete the other sort.

### Option A (Prefer): Repository guarantees ordering

- Keep sorting in the repository.
- Remove sorting from the use case and treat ordering as already normalized.
- Add/keep unit tests ensuring repository output has ordered choices.

### Option B: Use case guarantees ordering

- Remove sorting from the repository.
- Keep sorting in the use case (and any other consumer that needs ordering).

## Acceptance Criteria

- Exactly one layer owns choice ordering.
- Tests enforce the invariant at that boundary.
- No duplicated sorting in hot paths.

