# DEBT-169: Shared Application Utilities Missing Unit Tests

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-08
**Resolved:** 2026-02-08

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

Expanded and hardened the existing shared utility test suites:

1. **`src/application/shared/shuffled-choice-views.test.ts`**
   - Verifies deterministic output for same `(userId, questionId)`
   - Verifies seed changes produce different orderings (different users)
   - Verifies stable pre-shuffle sort with `sortOrder` then `id` tiebreaker
   - Verifies output shape/labels and INTERNAL_ERROR overflow guard typing

2. **`src/application/shared/enrich-with-question.test.ts`**
   - Covers all-found, all-missing, empty-input, and mixed found/missing paths
   - Verifies warning logger calls with correct question IDs for missing rows

## Verification

- [x] `shuffled-choice-views.test.ts` covers deterministic, seed variance, tiebreak, and overflow paths
- [x] `enrich-with-question.test.ts` covers all-found, missing, empty, and mixed paths
- [x] Logger warning behavior is verified for missing-question cases
- [x] `pnpm test --run` passes
- [x] `pnpm typecheck` passes

## Related

- `src/application/shared/shuffled-choice-views.ts`
- `src/application/shared/enrich-with-question.ts`
- `src/domain/services/` — `createQuestionSeed`, `shuffleWithSeed`
- `src/domain/value-objects/` — `AllChoiceLabels`
- `src/domain/test-helpers/` — `createQuestion()`, `createChoice()`
