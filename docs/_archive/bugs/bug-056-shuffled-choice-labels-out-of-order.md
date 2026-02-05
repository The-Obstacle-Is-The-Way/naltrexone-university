# BUG-056: Shuffled Choice Labels Display Out of Order

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-05
**Resolved:** 2026-02-05

---

## Description

In the Practice flow, answer choices are deterministically shuffled per user+question. The UI displayed each choice’s persisted label (A–E) from authoring, so the rendered labels appeared out of sequence (e.g., `C, D, B, A` top-to-bottom).

**Expected:** Choice labels should render sequentially (`A, B, C, D` …) in the presented order.

---

## Steps to Reproduce

1. Go to `/app/practice`.
2. Load a multiple-choice question with 4 choices.
3. Observe the choice labels are not necessarily `A, B, C, D` in order.

---

## Root Cause

`GetNextQuestionUseCase.mapChoicesForOutput()` shuffles the choice array, but returned `label: c.label` from the persisted choice entity. Because labels were authored for the pre-shuffle order, the shuffle caused the UI’s displayed labels to look “out of order”.

---

## Fix

- After shuffling, assign display labels based on the presented index:
  - `label = AllChoiceLabels[index]`
  - `sortOrder = index + 1`
- Added a unit test to ensure labels are sequential in presented order even when the shuffle is non-identity.

---

## Verification

- [x] Unit test added: `src/application/use-cases/get-next-question.test.ts`
- [x] `pnpm test --run src/application/use-cases/get-next-question.test.ts`

---

## Related

- [BUG-029](./bug-029-answer-choices-not-randomized.md)
