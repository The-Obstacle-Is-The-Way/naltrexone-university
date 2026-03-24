# DEBT-335: Remove All-or-Nothing Wrong-Answer Display Guard

**Priority:** P2
**Created:** 2026-03-24
**Source:** [DEBT-275](./debt-275-bs033-residual-open-items.md) (Open Design Decision)
**Scope:** Single conditional change in `components/question/feedback.tsx`

---

## Problem

When a learner answers a question, the feedback UI can show per-choice explanations for why each wrong answer is wrong. However, there is an **all-or-nothing guard**: if even ONE incorrect choice is missing its `explanationMd` (null or blank), the entire "Why other answers are wrong" section is hidden — even for choices that DO have explanations.

This means many questions show **zero** wrong-answer feedback because a single choice lacks content.

### Current Code (`components/question/feedback.tsx`)

```tsx
const hasMissingIncorrectExplanation = choiceExplanations.some(
  (choice) =>
    !choice.isCorrect &&
    (choice.explanationMd === null ||
      choice.explanationMd.trim().length === 0),
);
const shouldRenderChoiceExplanations =
  !hasMissingIncorrectExplanation && visibleChoiceExplanations.length > 0;
```

## Decision

**Show whatever exists.** If 2 out of 3 wrong answers have explanations, show those 2. Hiding useful feedback because one sibling choice is incomplete hurts the learner more than showing a partial set.

## Fix

Remove the `hasMissingIncorrectExplanation` guard. Filter out choices with empty/null explanations from the rendered list instead:

```tsx
const shouldRenderChoiceExplanations = visibleChoiceExplanations.length > 0;
```

And filter `visibleChoiceExplanations` to only include choices that actually have content:

```tsx
const visibleChoiceExplanations = choiceExplanations.filter(
  (choice) =>
    !choice.isCorrect &&
    choice.explanationMd !== null &&
    choice.explanationMd.trim().length > 0,
);
```

## Content Authoring Impact

The `QUESTION-FORMAT-SPEC.md` in the external `addiction-final-2026` repo and `content/drafts/questions/QUESTION-FORMAT-SPEC.md` both state:

> "Every wrong answer must have an explanation. If any wrong-answer explanation is missing or blank, the entire 'Why other answers are wrong' section is hidden in the UI (all-or-nothing guard)."

After this fix, update that line to:

> "Every wrong answer should have an explanation. Missing explanations are silently excluded from the UI — the section still renders for choices that have content."

## Acceptance Criteria

- [ ] Questions with partial wrong-answer explanations show the explanations that exist
- [ ] Questions with ALL wrong-answer explanations still render exactly as before
- [ ] Questions with ZERO wrong-answer explanations still show nothing (no empty section)
- [ ] `QUESTION-FORMAT-SPEC.md` updated to reflect new behavior
- [ ] TDD: test written before code change
