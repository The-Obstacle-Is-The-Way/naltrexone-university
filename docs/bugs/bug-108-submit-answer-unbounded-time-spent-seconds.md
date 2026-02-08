# BUG-108: submitAnswer Allows Unbounded timeSpentSeconds at Use-Case Layer

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

`SubmitAnswerUseCase.execute()` clamps `timeSpentSeconds` to a minimum of 0 but does not enforce a maximum:

```typescript
const timeSpentSeconds =
  typeof rawTimeSpentSeconds === 'number' &&
  Number.isFinite(rawTimeSpentSeconds)
    ? Math.max(0, rawTimeSpentSeconds)
    : 0;
```

The controller layer (`question-controller.ts`) enforces `MAX_TIME_SPENT_SECONDS`, but the use case is the authoritative business logic layer. If the controller validation is bypassed (e.g., a different caller, a test, or a refactor), absurdly large values (billions of seconds) can be stored.

**Observed:** Use case allows any positive finite number for `timeSpentSeconds`.

**Expected:** Use case should enforce the same `MAX_TIME_SPENT_SECONDS` cap as the controller.

## Root Cause

Validation was added at the controller layer only, not at the use-case layer where business rules should live.

## Impact

- Corrupted per-question time averages in statistics
- Could make dashboard analytics meaningless for affected users
- Low probability since controller enforces the cap, but defense-in-depth gap

## Fix

Move `MAX_TIME_SPENT_SECONDS` validation into `SubmitAnswerUseCase` or into a domain-level value object.

## Verification

- [ ] Unit test for timeSpentSeconds exceeding cap
- [ ] Cap applied at use-case layer

## Related

- `src/application/use-cases/submit-answer.ts:86-91`
- `src/adapters/controllers/question-controller.ts:76`
