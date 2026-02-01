# DEBT-011: GetNextQuestionUseCase Violates Single Responsibility Principle

**Status:** Open
**Priority:** P2
**Date:** 2026-01-31

## Summary

The `GetNextQuestionUseCase` handles two completely different workflows with different algorithms, complexity levels, and error conditions. This violates SRP and makes the code harder to maintain.

## Location

- **File:** `src/application/use-cases/get-next-question.ts`
- **Lines:** 51-177

## Two Distinct Concerns

### Concern 1: Session-based Selection (lines 59-107)
- Get predefined question list from session params
- Return next unanswered question in order
- Simple sequential algorithm

### Concern 2: Filter-based Selection (lines 109-176)
- Query all published candidates matching filters
- Apply spaced repetition preference algorithm
- Complex selection with prioritization

```typescript
async execute(input: GetNextQuestionInput): Promise<GetNextQuestionOutput> {
  if ('sessionId' in input && typeof input.sessionId === 'string') {
    return this.executeForSession(input.userId, input.sessionId);  // Simple
  }
  return this.executeForFilters(input.userId, input.filters);  // Complex
}
```

## Why This Is a Problem

1. Two different algorithms with no shared logic
2. Changes to session flow may break filter flow
3. Hard to reason about - must understand both paths
4. Testing requires covering both concerns
5. Potential for bugs when modifying one path affects other

## Fix

Split into two separate use cases:

```typescript
// src/application/use-cases/get-session-next-question.ts
export class GetSessionNextQuestionUseCase {
  async execute(userId: string, sessionId: string): Promise<...> { ... }
}

// src/application/use-cases/get-filtered-next-question.ts
export class GetFilteredNextQuestionUseCase {
  async execute(userId: string, filters: Filters): Promise<...> { ... }
}
```

Then composition at the edge:
```typescript
// Server action or route handler picks which use case based on input
```

## Acceptance Criteria

- Two separate, focused use cases
- Each use case has single responsibility
- Tests are isolated per use case
- Shared helpers extracted if any common logic found
