# DEBT-326: Post-Exam Review Focus Management on Question Navigation

**Priority:** P3
**Created:** 2026-03-19
**Source:** BS-058 post-implementation audit
**Related:** [PostExamReviewView](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx)

---

## The Problem

When the user clicks Previous/Next or a navigator button in the post-exam review, the question content swaps in place but focus stays on the button that was clicked. Keyboard and screen-reader users may not realize the main content area has changed.

The controlled panel (`id={controlledPanelId}`, `tabIndex={-1}`) has `outline-none` but no effect moves focus to it after navigation.

## What The Current Code Actually Does Elsewhere

There is **not** an existing session-level focus handoff in the active exam flow that the post-exam review simply forgot to copy.

What exists today:

- `PracticeView` can accept a `questionAreaRef`, but the session runner does not pass one during active exam navigation
- the only nearby focus recovery in this slice is Quick Practice error recovery, where `usePracticeQuestionAnswerFlow` focuses the question area after an error-path reload

So this debt is still real, but it is a **new accessibility gap in the post-exam review**, not a regression from an already-solved active-exam pattern.

## Proposed Fix

After question navigation in `PostExamReviewView`, move focus to the controlled question panel (`id={controlledPanelId}`). This can be done with a `useEffect` that fires when `currentQuestionId` changes, calling `.focus()` on the panel ref.

Also add a polite announcement mechanism for screen readers, either by:

- making the focused panel sufficiently descriptive to announce the question change, or
- adding an `aria-live="polite"` region such as "Question 3 of 10"

## Acceptance Criteria

- [ ] Focus moves to the question panel after Previous/Next/navigator click
- [ ] Screen readers announce the question change
- [ ] No visual focus ring appears on the panel (already has `outline-none`)
