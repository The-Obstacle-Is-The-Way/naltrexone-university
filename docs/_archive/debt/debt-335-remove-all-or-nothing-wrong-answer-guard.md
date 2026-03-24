# DEBT-335: Remove All-or-Nothing Wrong-Answer Display Guard

**Priority:** P2
**Created:** 2026-03-24
**Updated:** 2026-03-24 (implemented, verified, and closed)
**Status:** Resolved (2026-03-24)
**Source:** [DEBT-275](../../debt/debt-275-bs033-residual-open-items.md) (Open Design Decision)
**Scope:** Shared `Feedback` render-rule change in `components/question/feedback.tsx`, plus targeted regression tests and authoring-doc updates

---

> **Resolved:** `Feedback` now renders the filtered incorrect choices that have
> non-blank `explanationMd`, even when sibling incorrect choices are missing
> explanations. Because the shared `Feedback` component is reused by both the
> question page and post-exam review, both surfaces inherit this fix.

## Problem (Historical)

When a learner answers a question, the feedback UI can show per-choice explanations for why each wrong answer is wrong. However, there is an **all-or-nothing guard**: if even ONE incorrect choice is missing its `explanationMd` (null or blank), the entire "Why other answers are wrong" section is hidden — even for choices that DO have explanations.

This means many questions show **zero** wrong-answer feedback because a single choice lacks content.

### Historical Code Path (`components/question/feedback.tsx:158-168` before closure)

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

## Implemented Fix

`visibleChoiceExplanations` is already filtered correctly by
`isIncorrectChoiceWithExplanation` at `components/question/feedback.tsx:158-160`.
The final code removed the separate `hasMissingIncorrectExplanation` guard and
let the existing filtered list drive rendering.

```tsx
const visibleChoiceExplanations = choiceExplanations.filter(
  isIncorrectChoiceWithExplanation,
);
const shouldRenderChoiceExplanations = visibleChoiceExplanations.length > 0;
```

### Shared Render Paths

- **Correct-answer flow:** `components/question/feedback.tsx:195-206` now renders
  `<WrongAnswerSection choices={visibleChoiceExplanations} />` whenever the
  filtered list is non-empty.
- **Incorrect-answer flow:** `components/question/feedback.tsx:168-176` derives
  `otherWrongChoices` from `visibleChoiceExplanations`, excluding only the
  learner's selected wrong choice. `components/question/feedback.tsx:238-239`
  renders the remaining sibling cards when present.
- **Consumers:** the shared `Feedback` component is rendered by
  `app/(app)/app/questions/[slug]/question-page-client.tsx:349-368` and
  `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:122-129`.

### Selected Wrong-Choice Edge Case

If the learner picked a wrong choice whose own `explanationMd` is null/blank:

- the red "your answer" card still renders the selected choice text
- that card still omits the missing explanation block
- the neutral "Why Other Answers Are Wrong" section now still renders any other
  wrong choices that do have explanations

That behavior comes from leaving `userChoice` sourced from the full
`choiceExplanations` array while sourcing `otherWrongChoices` from the filtered
`visibleChoiceExplanations` list.

## Verification

Targeted TDD coverage lives in `components/question/Feedback.test.tsx`:

- `renders available wrong-answer cards in correct flow when a sibling incorrect explanation is blank`
- `renders your-answer choice details when selected wrong explanation is null`
- existing zero-visible-cards fallback behavior remains covered by
  `falls back to general explanation when an incorrect choice explanation is missing`

`pnpm test --run components/question/Feedback.test.tsx` passes after the code
change.

## Content Authoring Impact

Authoring docs now need to match the live runtime behavior. Update the external
`addiction-final-2026/QUESTION-FORMAT-SPEC.md` plus the local
`content/drafts/questions/QUESTION-FORMAT-SPEC.md` and
`content/drafts/questions/CLAUDE.md` to say:

> Every wrong answer should have an explanation. Missing explanations are
> silently excluded from the UI, and the section still renders for choices that
> have content.

## Acceptance Criteria

- [x] Questions with partial wrong-answer explanations show the explanations that exist
- [x] Questions with ALL wrong-answer explanations still render exactly as before
- [x] Questions with ZERO wrong-answer explanations still show nothing (no empty section)
- [x] Incorrect-flow selected wrong choices still stay excluded from the neutral sibling list
- [x] Blank-string explanations are treated the same as null explanations
- [x] Local tracked authoring docs are updated to match the shipped behavior
- [x] TDD: tests were updated first, then the runtime change was applied
