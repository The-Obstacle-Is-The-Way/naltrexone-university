# DEBT-117: Choice Shuffling Logic Duplicated Across Use Cases

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

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

## Resolution

### Option A: Extract Domain Service (Recommended)

Create `src/domain/services/choice-shuffler.ts`:
```
shuffleChoices(choices: Choice[], questionId: string, sessionSeed: string): ShuffledChoice[]
```

Both use cases call the shared service. Single source of truth for shuffle + label assignment.

### Option B: Extract Application Helper

Create `src/application/shared/shuffle-choices.ts` if the logic depends on application-layer types.

## Verification

- [ ] Single function handles all choice shuffling
- [ ] `get-next-question.ts` and `submit-answer.ts` both delegate to it
- [ ] Existing shuffle tests still pass
- [ ] DEBT-111 fix (per-choice explanations) still works correctly

## Related

- `src/application/use-cases/get-next-question.ts:71-101`
- `src/application/use-cases/submit-answer.ts:47-76`
- `src/domain/services/shuffle.ts` (existing shuffle primitive)
- DEBT-111 (archived — explanation label mismatch caused by shuffle duplication)
