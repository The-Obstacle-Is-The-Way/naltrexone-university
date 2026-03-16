# DEBT-318: Bookmark visible before feedback in tutor mode and quick practice

**Priority:** P3
**Created:** 2026-03-16
**Related:** [BS-053](../brainstorming/bs-053-bookmark-vs-mark-for-review-collision.md), [Bookmark Surface Policy](../frontend/bookmark-surface-policy.md), [Bookmarks Dossier](../frontend/pages/bookmarks.md)

---

## Problem

BS-053 correctly removed bookmark from exam mode and added it to question review, but the remaining tutor-mode / quick-practice bookmark timing is still too early.

Today, the shared `PracticeView` renders bookmark as soon as a non-exam question is shown, even before the user submits an answer. That means tutor mode and quick practice expose bookmark on the bare question stem while the user is still performing, not reflecting.

This is narrower than BS-053. The problem is not that tutor mode and quick practice should lose bookmark entirely. The problem is that the current implementation exposes bookmark **before** the inline-feedback moment that justifies keeping it on those surfaces.

## Verified Current Behavior

- `app/(app)/app/practice/components/practice-view.tsx` renders bookmark with a single gate: `!isExamMode`
- There is no additional check on feedback visibility, `submitResult`, or any "post-answer" state before rendering the button
- `PracticeView` is reused by both tutor-mode sessions and quick practice, so both surfaces inherit the same pre-answer bookmark visibility
- The feedback panel is rendered from `feedbackResult`, which is derived from a non-exam `submitResult` with boolean correctness; bookmark therefore appears **before** the feedback-visible state that the current surface policy relies on
- Existing tests in `app/(app)/app/practice/components/practice-view.test.tsx` currently encode this behavior by asserting tutor-mode and quick-practice bookmark visibility on unanswered fixtures

## Expected Behavior

- Tutor mode and quick practice should remain bookmarkable surfaces
- The bookmark button should appear only once inline feedback is visible, not on the unanswered stem
- The preferred render gate is the same state that actually makes the explanation visible, not just a generic answered flag
- Good implementation candidates:
  - `!isExamMode && feedbackResult !== null`
  - `!isExamMode && props.submitResult !== null` if the team prefers to avoid branching on the derived local
- `props.isAnswered` alone is a weaker proxy. It is not identical to "feedback is showing" in the shared question-flow state, so the debt should not prescribe it as the only correct fix

## Scope

- **Production file:** `app/(app)/app/practice/components/practice-view.tsx`
- **Behavioral change:** Narrow the bookmark render condition so it follows post-feedback tutor/quick-practice state instead of all non-exam states
- **Test updates:** `app/(app)/app/practice/components/practice-view.test.tsx` and `.browser.spec.tsx`
  - add coverage for bookmark hidden on unanswered tutor / quick-practice questions
  - preserve coverage for bookmark visible after tutor-mode submission
  - update any existing assertions that currently expect pre-answer bookmark visibility

## Notes

- This is a follow-up refinement, not a reversal of BS-053
- It is an **intra-surface timing debt**: tutor mode and quick practice stay in the "YES bookmark" column, but only after the reflection moment starts
- If implemented, `docs/frontend/bookmark-surface-policy.md` should be updated to clarify that tutor-mode / quick-practice bookmark availability begins at the post-feedback state, not at initial stem render
