# DEBT-326: Post-Exam Review Focus Management on Question Navigation

**Priority:** P3
**Created:** 2026-03-19
**Source:** BS-058 post-implementation audit
**Related:** [PostExamReviewView](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx)

---

## The Problem

When the user clicks Previous/Next or a navigator button in the post-exam review, the question content swaps in place but focus stays on the button that was clicked. Keyboard and screen-reader users may not realize the main content area has changed.

The controlled panel (`id={controlledPanelId}`, `tabIndex={-1}`) has `outline-none` but no effect moves focus to it after navigation.

## How the Active Exam Handles This

During the active exam, `PracticeView` receives a `questionAreaRef` prop and the parent hook calls `questionAreaRef.current?.focus()` after loading a new question. The post-exam review does not wire this up.

## Proposed Fix

After question navigation in `PostExamReviewView`, move focus to the controlled question panel (`id={controlledPanelId}`). This can be done with a `useEffect` that fires when `currentQuestionId` changes, calling `.focus()` on the panel ref.

Optionally, add an `aria-live="polite"` region or visually hidden announcement like "Question 3 of 10" so screen readers announce the transition.

## Acceptance Criteria

- [ ] Focus moves to the question panel after Previous/Next/navigator click
- [ ] Screen readers announce the question change
- [ ] No visual focus ring appears on the panel (already has `outline-none`)
