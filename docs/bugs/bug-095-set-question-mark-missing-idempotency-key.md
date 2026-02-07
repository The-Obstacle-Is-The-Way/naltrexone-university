# BUG-095: `setPracticeSessionQuestionMark` Missing Idempotency Key

**Status:** Open
**Priority:** P4
**Date:** 2026-02-07

---

## Description

The `setPracticeSessionQuestionMark` server action does not use the `withIdempotency` wrapper, unlike `startPracticeSession` and `submitAnswer`. While the operation is semantically idempotent (setting `markedForReview: true` twice yields the same result), the inconsistency with the codebase pattern means it lacks the infrastructure-level deduplication that protects against concurrent requests exhausting optimistic locking retries.

## Root Cause

`src/adapters/controllers/practice-controller.ts:254-266`:

```typescript
export const setPracticeSessionQuestionMark = createAction({
  schema: SetPracticeSessionQuestionMarkInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.setPracticeSessionQuestionMarkUseCase.execute({
      userId,
      sessionId: input.sessionId,
      questionId: input.questionId,
      markedForReview: input.markedForReview,
    });
  },
});
```

No `idempotencyKey` field in schema, no `withIdempotency` wrapper.

Contrast with `startPracticeSession` (line 160-203) and `submitAnswer` in `question-controller.ts` which both use `withIdempotency()`.

## Impact

- **Low runtime risk** — SET semantics are naturally idempotent (setting `true` twice = `true`)
- **Optimistic locking exhaustion** — The repository uses version-based optimistic locking on `questionStates` JSON; concurrent duplicate requests could exhaust retries (3 max) and throw `CONFLICT`
- **Inconsistency** — This is the only practice mutation that lacks idempotency protection
- No data corruption possible — worst case is a transient CONFLICT error

## Proposed Fix

Add `idempotencyKey` to `SetPracticeSessionQuestionMarkInputSchema` and wrap with `withIdempotency`, following the same pattern as `startPracticeSession`.

## Verification

- [ ] Schema accepts optional `idempotencyKey`
- [ ] Duplicate calls with same key return same result
- [ ] Existing mark-for-review tests still pass
- [ ] UI generates new key per mark toggle attempt

## Related

- BUG-091 (`endPracticeSession` missing idempotency — same pattern)
- `src/adapters/controllers/practice-controller.ts`
- `src/adapters/shared/with-idempotency.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts` (UI call site)
