# DEBT-187: Duplicated Default PracticeSessionQuestionState Creation

**Status:** Open
**Priority:** P2
**Date:** 2026-02-08

---

## Description

Three use cases create the same default `PracticeSessionQuestionState` object inline:

```typescript
{
  questionId,
  markedForReview: false,
  latestSelectedChoiceId: null,
  latestIsCorrect: null,
  latestAnsweredAt: null,
}
```

### Affected Files

| File | Line |
|------|------|
| `src/application/use-cases/start-practice-session.ts` | 57 |
| `src/application/use-cases/get-practice-session-review.ts` | 102 |
| `src/application/use-cases/get-next-question.ts` | 96 |

## Impact

- If `PracticeSessionQuestionState` gains a new field, 3 files plus tests need updating
- Risk of one file being missed during schema changes
- Violates DRY principle

## Resolution

Create a factory function in `src/domain/services/session.ts`:

```typescript
export function createDefaultQuestionState(
  questionId: string,
): PracticeSessionQuestionState {
  return {
    questionId,
    markedForReview: false,
    latestSelectedChoiceId: null,
    latestIsCorrect: null,
    latestAnsweredAt: null,
  };
}
```

## Verification

- [ ] All 3 use cases use the shared factory
- [ ] No inline default state creation remains in production code
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run` passes

## Related

- DEBT-185, DEBT-186 — can all be resolved together as a session domain service extraction
