# DEBT-362: Review & Submit Screen Discoverability and Accessibility

**Priority:** P3
**Created:** 2026-04-11
**Status:** Open
**Affected surface:** ExamReviewView (`app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`)
**Verified by:** Claude-in-Chrome browser agent walkthrough (2026-04-11) + code trace

---

## Problem

The Review & Submit screen has two discoverability/accessibility gaps:

### Issue A: No explicit "Go back" button

**File:** `exam-review-view.tsx:219-268`

The bottom action area contains only "Submit exam" (line 222-224). There is no "Back," "Return to exam," or "Keep reviewing" button. The only way to navigate back to a specific question is to click one of the question rows in the list above.

While the question rows are clickable (via `onOpenQuestion` callback), their interactive nature isn't strongly afforded — they look like information rows. A user who doesn't realize the rows are clickable may feel trapped on the Review & Submit screen with no way back except submitting.

**Mitigating factor:** The submit confirmation dialog (triggered by "Submit exam") does include a "Keep reviewing" button that dismisses the dialog without submitting. So users who click submit prematurely can escape. But this is a workaround, not a primary affordance.

### Issue B: Question row buttons have generic accessible names

**File:** `exam-review-view.tsx:198-206`

Each question row renders as a `<button>` with an `sr-only` span reading "Open question" (line 206). The question number, stem preview, and status metadata are NOT included in the button's accessible name.

```tsx
<button>
  <span className="sr-only">Open question </span>
  {rowContent}  {/* visual-only: question #, stem, status — not in accessible name */}
</button>
```

A screen reader would announce "Open question, button" three times in a row with no way to distinguish which question is which.

**Contrast:** The `QuestionNavigator` component in the same file (line 97) correctly uses `aria-label={`Question ${row.order}: ${statusParts.join(', ')}`}` — including question number and all status. The question rows should follow the same pattern.

---

## Proposed fixes

### Fix A: Add explicit "Go back" affordance

Add a "Back to exam" or "Continue reviewing" button alongside "Submit exam":

```tsx
<div className="flex flex-wrap gap-3">
  <Button variant="outline" onClick={onOpenQuestion(lastViewedQuestionId)}>
    Continue reviewing
  </Button>
  <Button onClick={onSubmitExam}>
    Submit exam
  </Button>
</div>
```

Alternatively, add a visual cue to the question rows (e.g., hover state, cursor pointer, right chevron) to make their interactive nature more obvious.

### Fix B: Descriptive accessible names on question rows

```tsx
<button
  aria-label={`Open Question ${row.order}: ${stemPreview}. ${row.isAnswered ? 'Answered' : 'Unanswered'}${row.isMarkedForReview ? ', Marked for review' : ''}`}
>
  {rowContent}
</button>
```

---

## Files affected

| File | Change |
|------|--------|
| `exam-review-view.tsx:219-268` | Add "Continue reviewing" button |
| `exam-review-view.tsx:198-206` | Add descriptive `aria-label` to question row buttons |
| `exam-review-view.test.tsx` | Update assertions for new button and aria-labels |
| `exam-review-view.browser.spec.tsx` | Update assertions if any |

---

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Verified: no back button on Review & Submit | Browser agent walkthrough + code trace at exam-review-view.tsx:219-268 |
| 2026-04-11 | Verified: generic "Open question" sr-only label | Code trace at exam-review-view.tsx:206; contrast with navigator aria-label at line 97 |
| 2026-04-11 | Rated P3 | Functional workarounds exist (rows are clickable, submit dialog has "Keep reviewing"); accessibility gap is real but limited to screen reader navigation |
