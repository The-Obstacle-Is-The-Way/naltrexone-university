# DEBT-191: Missing Runtime Validation in GetNextQuestion Discriminated Union

**Status:** Open
**Priority:** P2
**Date:** 2026-02-08

---

## Description

`GetNextQuestionUseCase.execute()` uses a TypeScript discriminated union for its input, but the runtime dispatch has no fallback validation:

```typescript
// get-next-question.ts:37-44
async execute(input: GetNextQuestionInput): Promise<GetNextQuestionOutput> {
  if ('sessionId' in input && typeof input.sessionId === 'string') {
    return this.executeForSession(input.userId, input.sessionId, input.questionId);
  }
  return this.executeForFilters(input.userId, input.filters);
  //                                          ^^^^^^^^^^^^^^
  //                                    No runtime check that filters exists
}
```

If a caller passes an input that matches neither branch (e.g., missing both `sessionId` and `filters`), `input.filters` is `undefined` and `executeForFilters` receives invalid input.

### File

`src/application/use-cases/get-next-question.ts:37-44`

## Impact

- TypeScript catches this at compile time for well-typed callers
- But if the use case is called via a controller with incorrectly validated input, the error manifests deep in the repository layer rather than at the use case boundary
- Violates fail-fast principle

## Resolution

Add a guard:

```typescript
if (!('filters' in input) || !input.filters) {
  throw new ApplicationError(
    'VALIDATION_ERROR',
    'Either sessionId or filters must be provided',
  );
}
return this.executeForFilters(input.userId, input.filters);
```

## Verification

- [ ] Invalid input throws VALIDATION_ERROR at use case boundary
- [ ] Test added for the guard
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run` passes
