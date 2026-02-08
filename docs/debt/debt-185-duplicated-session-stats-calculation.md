# DEBT-185: Duplicated Session Stats Calculation Across Use Cases

**Status:** Open
**Priority:** P2
**Date:** 2026-02-08

---

## Description

Four use cases independently filter `questionStates` by `latestSelectedChoiceId !== null` to count answered/correct questions. The same pattern is copy-pasted:

```typescript
const answered = session.questionStates.filter(
  (state) => state.latestSelectedChoiceId !== null,
);
const correct = answered.filter(
  (state) => state.latestIsCorrect === true,
);
```

### Affected Files

| File | Line |
|------|------|
| `src/application/use-cases/end-practice-session.ts` | 38 |
| `src/application/use-cases/get-session-history.ts` | 46 |
| `src/application/use-cases/get-incomplete-practice-session.ts` | 27 |
| `src/application/use-cases/get-practice-session-review.ts` | 111 |

## Impact

- Change to answered/correct logic requires updating 4 files
- Risk of drift if one file is updated but others are missed
- Violates DRY principle

## Resolution

Extract to a domain service function in `src/domain/services/session.ts`:

```typescript
export function computeSessionStats(questionStates: PracticeSessionQuestionState[]) {
  const answeredStates = questionStates.filter(
    (state) => state.latestSelectedChoiceId !== null,
  );
  return {
    answered: answeredStates.length,
    correct: answeredStates.filter((state) => state.latestIsCorrect === true).length,
  };
}
```

## Verification

- [ ] All 4 use cases use the shared function
- [ ] No inline answered/correct calculation remains
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run` passes
