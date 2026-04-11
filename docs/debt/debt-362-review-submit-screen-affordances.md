# DEBT-362: Review & Submit Screen Return Affordance Gap

**Priority:** P3
**Created:** 2026-04-11
**Status:** Open
**Affected surface:** `ExamReviewView` (`app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`)
**Verified by:** Browser walkthrough on 2026-04-11 plus code trace

---

## Problem

`ExamReviewView` gives the user a clear `Submit exam` action, but it does not provide an equally explicit "continue reviewing" action outside the clickable question rows.

The current screen is not a dead end:

- each available row is a real `<button>`
- the rows have hover and focus styles
- the submit confirmation dialog includes `Keep reviewing`

But the primary return path is still implicit. A user has to infer that the question list itself is the way back into question editing.

---

## Verified Current Implementation

In [exam-review-view.tsx](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:167):

- every available question row renders as a `<button>` that calls `onOpenQuestion(row.questionId)`
- the footer renders only `Submit exam`
- the confirm dialog exposes `Keep reviewing` as a cancel action

The earlier draft of this debt doc overstated the accessibility issue. The row buttons are **not unnamed**:

- the visible row text sits inside the button
- the `sr-only` prefix adds `Open question`
- there is no `aria-hidden` on the row content

So this is not a WCAG 4.1.2 "button with no accessible name" failure. The gap is primarily discoverability and affordance.

---

## What Still Feels Weak

### 1. No dedicated return CTA

The footer presents the irreversible action (`Submit exam`) without a sibling action that explicitly says "keep reviewing" or "return to questions."

### 2. The list itself carries the burden of explanation

The question rows are interactive, but the screen does not tell the user that selecting a row is how they return to a question. The affordance depends on pattern recognition.

---

## Proposed Fixes

### Option A: Add explicit instructional copy

The lowest-risk fix is to add helper text above the list, for example:

```tsx
<p className="text-sm text-muted-foreground">
  Select a question below to continue reviewing before you submit.
</p>
```

This is feasible with the current component shape and keeps the screen simple.

### Option B: Strengthen row affordance

Add a stronger interaction cue to each row, such as:

- trailing chevron/icon
- `Continue reviewing` microcopy
- clearer hover treatment

Again, this is feasible without changing parent props.

### Option C: Add an explicit footer button only if the target is defined

If the product wants a real footer CTA such as `Continue reviewing`, the parent needs to define what it opens:

- last viewed question
- first unanswered question
- first marked question
- first question

`ExamReviewView` does not currently receive that target, so the earlier sketch that assumed `lastViewedQuestionId` was not directly implementable.

---

## Files Affected

| File | Change |
|------|--------|
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` | Add explicit helper copy and/or stronger row affordance |
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.test.tsx` | Update markup assertions if helper text or new cues are added |
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.browser.spec.tsx` | Update browser assertions if the visible guidance changes |

No `aria-label` remediation is required for correctness based on the current code.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Corrected the accessibility claim | The question-row buttons already expose accessible text through their button content. |
| 2026-04-11 | Reframed the debt as discoverability/affordance, not missing accessible names | That matches the actual code and the observed UX issue. |
| 2026-04-11 | Kept severity at P3 | The user is not blocked, but the current screen makes the return path more implicit than it needs to be. |
