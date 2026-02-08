# DEBT-169: Shared Application Utilities Missing Unit Tests

**Status:** Open
**Priority:** P1
**Date:** 2026-02-08

---

## Description

Two shared utility modules in `src/application/shared/` have zero unit test coverage despite being used by multiple controllers and use cases across the application:

### 1. `shuffled-choice-views.ts` — `buildShuffledChoiceViews()`

- **Used by:** `PracticeQuestionController`, `QuestionReviewController`, and any controller that presents shuffled choices to users
- **Logic:** Sorts choices by `sortOrder` (with `id` tiebreaker), shuffles with a user-specific seed, maps to display labels (`A`, `B`, `C`, `D`)
- **Untested behaviors:**
  - Deterministic shuffling: same `(userId, questionId)` always produces same order
  - Stable sort before shuffle: `sortOrder` primary, `id` secondary
  - Label assignment: indices map correctly to `AllChoiceLabels`
  - Overflow guard: throws `ApplicationError('INTERNAL_ERROR')` when choices exceed label count
  - Output shape: `choiceId`, `displayLabel`, `textMd`, `sortOrder`, `isCorrect`, `explanationMd`

### 2. `enrich-with-question.ts` — `enrichWithQuestion()`

- **Used by:** `GetMissedQuestionsUseCase`, `GetBookmarkedQuestionsUseCase`, and any use case that joins rows with question data
- **Logic:** Maps rows against a question lookup map, calling `available()` or `unavailable()` callbacks, and logs warnings for missing questions
- **Untested behaviors:**
  - Happy path: all questions found, `available()` called for each
  - Missing question: `unavailable()` called, warning logged with `questionId`
  - Empty rows: returns empty array
  - Mixed: some found, some missing — correct callbacks called for each
  - Logger interaction: `warn()` called with correct message for missing questions

## Impact

- **No regression protection** for two widely-used shared utilities
- **Refactoring risk** — any change to shuffle logic or enrichment could silently break multiple controllers/use cases
- **Inconsistent with project standards** — the project mandates TDD and has comprehensive test coverage elsewhere; these are gaps
- **Shuffle correctness is critical** — if `buildShuffledChoiceViews` produces non-deterministic results, users see different choice orders on page refresh, breaking their mental model

## Resolution

Create colocated test files:

1. **`src/application/shared/shuffled-choice-views.test.ts`**
   - Test deterministic output for same `(userId, questionId)`
   - Test different output for different users/questions
   - Test stable pre-shuffle sort (choices with same `sortOrder` use `id` tiebreaker)
   - Test label assignment (`A`, `B`, `C`, `D`)
   - Test overflow: question with >26 choices throws `INTERNAL_ERROR`
   - Use domain test factories: `createQuestion()`, `createChoice()`

2. **`src/application/shared/enrich-with-question.test.ts`**
   - Test all-found path
   - Test missing-question path (calls `unavailable`, logs warning)
   - Test empty input
   - Test mixed found/missing
   - Use `FakeLogger` from test helpers

## Verification

- [ ] `shuffled-choice-views.test.ts` created with full coverage
- [ ] `enrich-with-question.test.ts` created with full coverage
- [ ] All edge cases from the lists above are tested
- [ ] `pnpm test --run` passes
- [ ] `pnpm typecheck` passes

## Related

- `src/application/shared/shuffled-choice-views.ts`
- `src/application/shared/enrich-with-question.ts`
- `src/domain/services/` — `createQuestionSeed`, `shuffleWithSeed`
- `src/domain/value-objects/` — `AllChoiceLabels`
- `src/domain/test-helpers/` — `createQuestion()`, `createChoice()`
