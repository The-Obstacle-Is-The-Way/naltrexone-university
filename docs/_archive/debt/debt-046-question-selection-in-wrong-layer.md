# DEBT-046: Question Selection Algorithm in Wrong Layer

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-01
**Resolved:** 2026-02-02

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

Implemented a domain service and made the use case delegate to it:

1. Added `src/domain/services/question-selection.ts` + `question-selection.test.ts`
2. Exported the new service from `src/domain/services/index.ts`
3. Updated `GetNextQuestionUseCase` to call `selectNextQuestionId(...)` for the filters path
4. Updated SPEC-003 file list to include the new domain service

## Verification

- [x] Domain service exists with pure function
- [x] Domain service has unit tests
- [x] Use case delegates to domain service
- [x] Existing use case tests still pass

## Related

- Clean Architecture skill: `usecase-orchestrates-not-implements`
- `src/domain/services/` - Other domain services
- SPEC-003 (Domain Services) - Should document this service
