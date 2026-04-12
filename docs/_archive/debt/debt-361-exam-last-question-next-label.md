# DEBT-361: Exam Last Question `Next` Label Does Not Match The Action

**Priority:** P3
**Created:** 2026-04-11
**Status:** Resolved (2026-04-11)
**Affected surface:** Exam action bar in `app/(app)/app/practice/components/practice-view.tsx`
**Verified by:** Browser walkthrough on 2026-04-11 plus code trace

---

## Problem

At the time this debt was filed, the last exam question kept the middle-button label `Next` even though clicking it entered the Review & Submit stage instead of opening another question.

That was a real product mismatch, even though it was implemented intentionally.

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

Before resolution, the visible label was hardcoded:

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

So the pre-fix implementation already acknowledged the semantic mismatch for assistive technology while leaving the visual label unchanged.

---

## Contract Status

When this debt was opened, it was aligned with the shipped contract in [interaction-contracts.md](../practice-engine/interaction-contracts.md): the last exam question still used `Next`, and that click entered the review stage.

That made this debt item a product/UI debt issue against the then-current contract, not a code/doc mismatch bug.

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

## Resolution

Shipped on 2026-04-11.

- `ExamActionBar` now renders `Review & Submit` on the last exam question while preserving the existing `onEndSession` branch and `aria-describedby` hint.
- Terminal-question assertions were updated in both `practice-view` test suites and in the routed session-page browser coverage that also asserts the footer label.
- Practice-engine documentation now reflects the shipped last-question label.

---

## Files Affected

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-view.tsx` | Conditional last-question label |
| `app/(app)/app/practice/components/practice-view.test.tsx` | Update string assertions |
| `app/(app)/app/practice/components/practice-view.browser.spec.tsx` | Update browser assertions if the last-question CTA text is asserted |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx` | Update routed-session browser assertion for the last-question footer label |
| `docs/practice-engine/interaction-contracts.md` | Update the shipped interaction contract |
| `docs/practice-engine/practice-modes.md` | Update exam review-stage entry wording |
| `docs/practice-engine/question-rendering-architecture.md` | Update active exam footer description |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Confirmed the behavior was current-by-design, not a code/doc mismatch | The then-current contract still specified `Next` on the last exam question. |
| 2026-04-11 | Kept severity at P3 | This is cognitive friction in a primary flow, but the user is not blocked. |
| 2026-04-11 | Recommended `Review & Submit` as the leading copy option | It matches the actual destination screen and avoids implying the exam is already submitted. |
| 2026-04-11 | Resolved with a label-only presentation change | The action path was already correct; only the visible terminal CTA label and downstream assertions/docs needed updating. |
