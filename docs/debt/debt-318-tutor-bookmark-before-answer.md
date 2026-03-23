# DEBT-318: Bookmark visible before feedback in tutor mode and quick practice

**Priority:** P3
**Created:** 2026-03-16
**Related:** [BS-053](../brainstorming/bs-053-bookmark-vs-mark-for-review-collision.md), [Bookmark Surface Policy](../frontend/bookmark-surface-policy.md), [Bookmarks Dossier](../frontend/pages/bookmarks.md)

---

## Implementation Update (2026-03-22)

- Audit against the current codebase confirms the behavior debt is still open: tutor mode and quick practice still show bookmark before inline feedback.
- `PracticeView` was refactored on 2026-03-18 during DEBT-320. The old top-level `!isExamMode` bookmark branch no longer exists; non-exam questions now render `TutorActionBar`, and that action bar renders bookmark unconditionally.
- `docs/frontend/bookmark-surface-policy.md` already documents the intended post-feedback timing. Code now lags the policy, not the other way around.
- No commit since 2026-03-16 has implemented the post-feedback-only bookmark gate.

---

## Problem

BS-053 correctly removed bookmark from exam mode and added it to question review, but the remaining tutor-mode / quick-practice bookmark timing is still too early.

Today, the shared `PracticeView` still exposes bookmark as soon as a non-exam question reaches the tutor action bar, even before the user submits an answer. That means tutor mode and quick practice still expose bookmark on the bare question stem while the user is performing, not reflecting.

This is narrower than BS-053. Tutor mode and quick practice should remain bookmarkable surfaces. The debt is about timing within those surfaces, not removing bookmark from them.

## Verified Current Behavior

- `app/(app)/app/practice/components/practice-view.tsx` still owns the timing debt, but not through a single inline `!isExamMode` bookmark branch anymore.
- `PracticeView` now renders `ExamActionBar` for exam questions and `TutorActionBar` for non-exam questions. Inside `TutorActionBar`, the bookmark `Button` always renders whenever `PracticeView` has a question and is in the non-exam branch; there is still no check on `feedbackResult`, `submitResult`, or another explicit "feedback is visible" flag before showing it.
- `PracticeViewProps` still includes `isAnswered` and `submitResult`. `feedbackResult` is still a local derived value, not a prop. It is derived from a non-exam `submitResult` only when `hasBooleanCorrectness(props.submitResult)` is true.
- Because `SubmitAnswerOutput.isCorrect` is `boolean | null`, `props.submitResult !== null` is no longer identical to "feedback is visible." Current tests still cover the case where `submitResult` exists but feedback stays hidden when correctness is unknown.
- `PracticeView` is still reused by both tutor-mode sessions and quick practice:
  - `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` passes session question-flow answer state plus bookmark state from `usePracticeSessionPageController`
  - `app/(app)/app/practice/quick/quick-practice-client.tsx` passes question-flow answer state plus bookmark state from `usePracticeQuestionFlow`
- The bookmark hook itself (`app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts`) is answer-state agnostic. It computes bookmark state from the current question only. The pre-answer timing debt is therefore a view-layer render-gate issue, not a bookmark-data issue.
- Existing tests still encode the pre-answer behavior:
  - `app/(app)/app/practice/components/practice-view.test.tsx` asserts bookmark visibility on unanswered tutor and quick-practice fixtures
  - `app/(app)/app/practice/page.test.tsx` still asserts that `PracticeView` renders a bookmark control whenever a question is present
  - `app/(app)/app/practice/components/practice-view.browser.spec.tsx` still assumes unanswered tutor bookmark presence in the loading-state coverage
- There is another bookmark-bearing practice-flow component now: `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx` renders its own bookmark button during post-exam review. That surface is separate from this debt.

## Expected Behavior

- Tutor mode and quick practice should remain bookmarkable surfaces
- The bookmark button should appear only once inline feedback is visible, not on the unanswered stem
- The preferred render gate is the same state that actually makes the explanation visible, not just a generic answered flag
- Good implementation candidates in the current code shape:
  - `feedbackResult !== null`
  - `hasBooleanCorrectness(props.submitResult)` if the team wants to avoid branching on the derived local while still matching feedback visibility
- `props.submitResult !== null` is no longer equivalent to "feedback is showing" because `SubmitAnswerOutput.isCorrect` can be `null`
- `props.isAnswered` alone is still a weaker proxy. It is not identical to "feedback is showing" in the current shared question-flow state

## Scope

- **Primary production file:** `app/(app)/app/practice/components/practice-view.tsx`
- **Relevant pass-through callers:** `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`, `app/(app)/app/practice/quick/quick-practice-client.tsx`
- **Relevant state sources:** `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`, `app/(app)/app/practice/hooks/use-practice-question-flow.ts`, `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts`
- **Behavioral change:** Narrow tutor/quick-practice bookmark rendering so it tracks post-feedback state instead of all non-exam question states
- **Test updates:** `app/(app)/app/practice/components/practice-view.test.tsx`, `app/(app)/app/practice/components/practice-view.browser.spec.tsx`, and `app/(app)/app/practice/page.test.tsx`
  - add coverage for bookmark hidden on unanswered tutor / quick-practice questions
  - preserve coverage for bookmark visible once tutor-mode feedback is visible
  - keep the unknown-correctness edge case aligned with whichever feedback-visibility rule is chosen
  - update current assertions that still expect pre-answer bookmark visibility
- **Out of scope:** `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx`; that bookmark surface is post-finalization review, not tutor/quick-pre-answer timing

## Notes

- This is a follow-up refinement, not a reversal of BS-053
- It remains an **intra-surface timing debt**: tutor mode and quick practice stay in the "YES bookmark" column, but only after the reflection moment starts
- `docs/frontend/bookmark-surface-policy.md` already describes tutor-mode / quick-practice bookmark availability as beginning once feedback is visible. The current mismatch is now between shipped code and the policy doc, not between the two docs.
