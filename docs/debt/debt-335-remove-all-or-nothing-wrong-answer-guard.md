# DEBT-335: Remove All-or-Nothing Wrong-Answer Display Guard

**Priority:** P2
**Created:** 2026-03-24
**Source:** [DEBT-275](./debt-275-bs033-residual-open-items.md) (Open Design Decision)
**Scope:** Single conditional change in `components/question/feedback.tsx`

---

## Problem

When a learner answers a question, the feedback UI can show per-choice explanations for why each wrong answer is wrong. However, there is an **all-or-nothing guard**: if even ONE incorrect choice is missing its `explanationMd` (null or blank), the entire "Why other answers are wrong" section is hidden — even for choices that DO have explanations.

This means many questions show **zero** wrong-answer feedback because a single choice lacks content.

### Current Code (`components/question/feedback.tsx:158-168`)

```tsx
const visibleChoiceExplanations = choiceExplanations.filter(
  isIncorrectChoiceWithExplanation,
);
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

`visibleChoiceExplanations` is already filtered correctly by
`isIncorrectChoiceWithExplanation` at `components/question/feedback.tsx:158-160`.
The actual change is narrower: remove the separate
`hasMissingIncorrectExplanation` guard and let the existing filtered list drive
rendering.

```tsx
const visibleChoiceExplanations = choiceExplanations.filter(
  isIncorrectChoiceWithExplanation,
);
const shouldRenderChoiceExplanations = visibleChoiceExplanations.length > 0;
```

`otherWrongChoices` in the incorrect-answer flow (`components/question/feedback.tsx:175-183`)
already derives from `visibleChoiceExplanations`, so that flow picks up the
same behavior automatically once the guard is removed.

## Content Authoring Impact

Authoring docs should stay aligned with runtime behavior. Today the UI still
hides the entire wrong-answer section if any incorrect choice lacks an
explanation. When this fix ships, update the external
`addiction-final-2026/QUESTION-FORMAT-SPEC.md` plus the local
`content/drafts/questions/QUESTION-FORMAT-SPEC.md` and
`content/drafts/questions/CLAUDE.md` to say:

> Every wrong answer should have an explanation. Missing explanations are
> silently excluded from the UI, and the section still renders for choices that
> have content.

## Acceptance Criteria

- [ ] Questions with partial wrong-answer explanations show the explanations that exist
- [ ] Questions with ALL wrong-answer explanations still render exactly as before
- [ ] Questions with ZERO wrong-answer explanations still show nothing (no empty section)
- [ ] External and local authoring docs are updated when the code change ships
- [ ] TDD: test written before code change
