# DEBT-318: Bookmark visible before feedback in tutor mode and quick practice

**Priority:** P3
**Created:** 2026-03-16
**Related:** [BS-053](../../brainstorming/bs-053-bookmark-vs-mark-for-review-collision.md), [Bookmark Surface Policy](../../frontend/bookmark-surface-policy.md), [Bookmarks Dossier](../../frontend/pages/bookmarks.md)

---

## Historical Audit (2026-03-22)

- Audit against the then-current codebase confirmed the behavior debt was still open: tutor mode and quick practice still showed bookmark before inline feedback.
- `PracticeView` had been refactored on 2026-03-18 during DEBT-320. The old top-level `!isExamMode` bookmark branch no longer existed; non-exam questions rendered `TutorActionBar`, and that action bar rendered bookmark unconditionally.
- `docs/frontend/bookmark-surface-policy.md` already documented the intended post-feedback timing. At audit time, code lagged the policy.
- No commit through 2026-03-22 had implemented the post-feedback-only bookmark gate.

---

## Problem

BS-053 correctly removed bookmark from exam mode and added it to question review, but the remaining tutor-mode / quick-practice bookmark timing is still too early.

Today, the shared `PracticeView` still exposes bookmark as soon as a non-exam question reaches the tutor action bar, even before the user submits an answer. That means tutor mode and quick practice still expose bookmark on the bare question stem while the user is performing, not reflecting.

This is narrower than BS-053. Tutor mode and quick practice should remain bookmarkable surfaces. The debt is about timing within those surfaces, not removing bookmark from them.

## Verified Pre-Resolution Behavior

- `app/(app)/app/practice/components/practice-view.tsx` owned the timing debt, but not through a single inline `!isExamMode` bookmark branch anymore.
- `PracticeView` rendered `ExamActionBar` for exam questions and `TutorActionBar` for non-exam questions. Inside `TutorActionBar`, the bookmark `Button` rendered whenever `PracticeView` had a question and was in the non-exam branch; there was no check on `feedbackResult`, `submitResult`, or another explicit "feedback is visible" flag before showing it.
- `PracticeViewProps` still includes `isAnswered` and `submitResult`. `feedbackResult` is still a local derived value, not a prop. It is derived from a non-exam `submitResult` only when `hasBooleanCorrectness(props.submitResult)` is true.
- Because `SubmitAnswerOutput.isCorrect` is `boolean | null`, `props.submitResult !== null` was no longer identical to "feedback is visible." Current tests already covered the case where `submitResult` existed but feedback stayed hidden when correctness was unknown.
- `PracticeView` was reused by both tutor-mode sessions and quick practice:
  - `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` passes session question-flow answer state plus bookmark state from `usePracticeSessionPageController`
  - `app/(app)/app/practice/quick/quick-practice-client.tsx` passes question-flow answer state plus bookmark state from `usePracticeQuestionFlow`
- The bookmark hook itself (`app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts`) is answer-state agnostic. It computes bookmark state from the current question only. The timing debt was therefore a view-layer render-gate issue, not a bookmark-data issue.
- The then-current tests still encoded the pre-answer behavior:
  - `app/(app)/app/practice/components/practice-view.test.tsx` asserted bookmark visibility on unanswered tutor and quick-practice fixtures
  - `app/(app)/app/practice/page.test.tsx` still asserted that `PracticeView` rendered a bookmark control whenever a question was present
  - `app/(app)/app/practice/components/practice-view.browser.spec.tsx` still assumed unanswered tutor bookmark presence in the loading-state coverage
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

## Resolution (2026-03-23)

- `TutorActionBar` now gates bookmark rendering with `hasBooleanCorrectness(props.submitResult)`, matching the same predicate `PracticeView` already used for `feedbackResult`
- unanswered tutor mode and quick practice no longer render bookmark
- post-feedback tutor mode and quick practice still render bookmark
- `SubmitAnswerOutput.isCorrect === null` now keeps bookmark hidden, so the action bar no longer exposes a bookmark control while feedback is still suppressed
- regression coverage now verifies:
  - bookmark hidden on unanswered tutor / quick-practice questions
  - bookmark visible after feedback in tutor / quick-practice flows
  - tutor action-bar ordering both before feedback (`Previous`, `Submit`, `Next`) and after feedback (`Previous`, `Next`, `Bookmark`)
  - bookmark remains hidden when submit correctness is unknown
- `docs/frontend/bookmark-surface-policy.md` already described the intended post-feedback surface policy; this resolution brings the implementation into full alignment
- verification passed on `2026-03-23`:
  - `pnpm test --run app/(app)/app/practice/components/practice-view.test.tsx`
  - `pnpm test:browser app/(app)/app/practice/components/practice-view.browser.spec.tsx`

## Notes

- This is a follow-up refinement, not a reversal of BS-053
- This debt is resolved and archived
- Tutor mode and quick practice remain in the "YES bookmark" column, but only after the reflection moment starts
