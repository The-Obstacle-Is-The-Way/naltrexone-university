# DEBT-046: Question Selection Algorithm in Wrong Layer

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

---

## Description

The `GetNextQuestionUseCase` implements the question selection algorithm directly instead of delegating to a domain service. This violates the Clean Architecture rule `usecase-orchestrates-not-implements`.

**Rule:** Use cases should orchestrate entities and domain services, not implement business rules directly.

**Current Implementation (lines 129-155):**

```typescript
// Prefer a never-attempted question
for (const questionId of candidateIds) {
  if (!byQuestionId.has(questionId)) {
    selectedId = questionId;
    break;
  }
}

// If all attempted, pick oldest
if (!selectedId) {
  let oldestQuestionId: string | null = null;
  let oldestAnsweredAt: Date | null = null;
  for (const questionId of candidateIds) {
    const answeredAt = byQuestionId.get(questionId);
    if (!answeredAt) continue;
    if (!oldestAnsweredAt || answeredAt < oldestAnsweredAt) {
      oldestAnsweredAt = answeredAt;
      oldestQuestionId = questionId;
    }
  }
  selectedId = oldestQuestionId;
}
```

This selection logic (prefer unattempted, then select oldest) is a **business rule** about how questions are prioritized. It belongs in the domain layer.

## Impact

- **Testability:** Business rule testing requires instantiating the full use case
- **Reusability:** Algorithm can't be reused by other use cases without duplication
- **Clarity:** Business rules are hidden inside orchestration code
- **Maintainability:** Changes to selection logic require modifying the use case

## Location

- `src/application/use-cases/get-next-question.ts:129-155`

## Resolution

1. Create domain service `src/domain/services/question-selection.ts`:

```typescript
export type AttemptHistory = ReadonlyMap<string, Date>;

export function selectNextQuestionId(
  candidateIds: readonly string[],
  attemptHistory: AttemptHistory,
): string | null {
  // Prefer unattempted questions
  for (const questionId of candidateIds) {
    if (!attemptHistory.has(questionId)) {
      return questionId;
    }
  }

  // All attempted - select oldest
  let oldestId: string | null = null;
  let oldestDate: Date | null = null;

  for (const questionId of candidateIds) {
    const answeredAt = attemptHistory.get(questionId);
    if (!answeredAt) continue;
    if (!oldestDate || answeredAt < oldestDate) {
      oldestDate = answeredAt;
      oldestId = questionId;
    }
  }

  return oldestId;
}
```

2. Add unit tests for the domain service
3. Update `GetNextQuestionUseCase` to call this service

## Verification

- [ ] Domain service exists with pure function
- [ ] Domain service has unit tests
- [ ] Use case delegates to domain service
- [ ] Existing use case tests still pass

## Related

- Clean Architecture skill: `usecase-orchestrates-not-implements`
- `src/domain/services/` - Other domain services
- SPEC-003 (Domain Services) - Should document this service
