# DEBT-117: Choice Shuffling Logic Duplicated Across Use Cases

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-06
**Resolved:** 2026-02-06

---

## Description

Identical choice shuffling logic (seed creation → sort → shuffle → map) exists in two use cases:

1. `src/application/use-cases/get-next-question.ts` (lines 71-101)
2. `src/application/use-cases/submit-answer.ts` (lines 47-76)

Both files independently:
- Create a shuffle seed from `questionId + sessionSeed`
- Sort choices deterministically
- Apply Fisher-Yates shuffle with the seed
- Map choices to output format with letter labels (A, B, C, D)

This is a textbook DRY violation. If the shuffling algorithm changes (e.g., to fix DEBT-111-style label mismatches), both files must be updated in lockstep.

## Impact

- Any shuffle algorithm change requires coordinated edits in 2 files
- Risk of divergence if one file is updated and the other isn't
- The shuffled-choice-to-label mapping is particularly fragile — DEBT-111 was caused by exactly this kind of duplication

## Resolution (Implemented)

Implemented Option B (application helper), because the logic depends on
application output shape and `ApplicationError` handling:

- Added `src/application/shared/shuffled-choice-views.ts`
  - `buildShuffledChoiceViews(question, userId)` centralizes:
    - deterministic stable input sort
    - `createQuestionSeed + shuffleWithSeed`
    - display label assignment and `sortOrder`
- Refactored both use cases to delegate:
  - `src/application/use-cases/get-next-question.ts`
  - `src/application/use-cases/submit-answer.ts`
- Added dedicated helper tests:
  - `src/application/shared/shuffled-choice-views.test.ts`

## Verification

- [x] Single function handles all choice shuffling
- [x] `get-next-question.ts` and `submit-answer.ts` both delegate to it
- [x] Existing shuffle tests still pass
- [x] DEBT-111 behavior remains correct after refactor

## Related

- `src/application/shared/shuffled-choice-views.ts`
- `src/application/use-cases/get-next-question.ts`
- `src/application/use-cases/submit-answer.ts`
- `src/application/shared/shuffled-choice-views.test.ts`
- DEBT-111 (archived)
