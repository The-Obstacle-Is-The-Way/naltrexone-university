# DEBT-361: Exam Last Question `Next` Label Does Not Match The Action

**Priority:** P3
**Created:** 2026-04-11
**Status:** Open
**Affected surface:** Exam action bar in `app/(app)/app/practice/components/practice-view.tsx`
**Verified by:** Browser walkthrough on 2026-04-11 plus code trace

---

## Problem

On the last exam question, the middle button still says `Next` even though clicking it enters the Review & Submit stage instead of opening another question.

That is a real product mismatch, even though it is currently implemented intentionally.

---

## Code Trace

The behavior lives in [practice-view.tsx](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/components/practice-view.tsx:192).

`ExamActionBar` computes the action like this:

```ts
const onMiddleAction =
  props.isLastSessionQuestion && props.onEndSession
    ? props.onEndSession
    : props.onNextQuestion;
```

But the visible label is still hardcoded:

```tsx
<Button ...>
  Next
</Button>
```

There is an accessibility hint for the last-question case:

```ts
const nextActionDescription =
  props.isLastSessionQuestion && props.onEndSession
    ? 'Opens review and submit.'
    : null;
```

So the current implementation already acknowledges the semantic mismatch for assistive technology while leaving the visual label unchanged.

---

## Contract Status

This is currently aligned with the shipped contract in [interaction-contracts.md](../practice-engine/interaction-contracts.md): the last exam question still uses `Next`, and that click enters the review stage.

That means this debt item is not a "doc says one thing, code does another" bug. It is a product/UI debt item against the current contract.

---

## Contrast Surface

[PostExamReviewView](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:154) already swaps the last forward CTA from `Next` to `Finish review`.

That contrast makes the exam-taking label feel weaker: one flow names the terminal action, the other one does not.

---

## Proposed Fix

Change the last-question label to a terminal-stage label such as `Review & Submit`:

```tsx
<Button ...>
  {props.isLastSessionQuestion && props.onEndSession
    ? 'Review & Submit'
    : 'Next'}
</Button>
```

Notes:

- `Review & Submit` is the cleanest match to the destination screen heading.
- `Review answers` would be less precise because the next screen is still pre-submit.
- The existing `aria-describedby` hint can stay or be removed; the visible-label change is the important part.

---

## Files Affected

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-view.tsx` | Conditional last-question label |
| `app/(app)/app/practice/components/practice-view.test.tsx` | Update string assertions |
| `app/(app)/app/practice/components/practice-view.browser.spec.tsx` | Update browser assertions if the last-question CTA text is asserted |
| `docs/practice-engine/interaction-contracts.md` | Update the current contract if this ships |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Confirmed the behavior is current-by-design, not a code/doc mismatch | The current contract still specifies `Next` on the last exam question. |
| 2026-04-11 | Kept severity at P3 | This is cognitive friction in a primary flow, but the user is not blocked. |
| 2026-04-11 | Recommended `Review & Submit` as the leading copy option | It matches the actual destination screen and avoids implying the exam is already submitted. |
