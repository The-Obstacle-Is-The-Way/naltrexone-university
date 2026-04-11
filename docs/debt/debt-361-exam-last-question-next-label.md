# DEBT-361: Exam Last Question "Next" Label Doesn't Reflect Action

**Priority:** P3
**Created:** 2026-04-11
**Status:** Open
**Affected surface:** PracticeView exam action bar (`app/(app)/app/practice/components/practice-view.tsx`)
**Verified by:** Claude-in-Chrome browser agent walkthrough (2026-04-11) + code trace

---

## Problem

On the last question of an exam (e.g., Q3 of 3), the middle button still says "Next" even though clicking it enters the Review & Submit stage, not the next question. The action changes but the label doesn't.

### Code trace

**File:** `app/(app)/app/practice/components/practice-view.tsx`

The `ExamActionBar` component (lines 192-255) determines the click handler based on position:

```typescript
// Lines 202-205
const onMiddleAction =
  props.isLastSessionQuestion && props.onEndSession
    ? props.onEndSession        // ← Review & Submit on last question
    : props.onNextQuestion;      // ← Next question otherwise
```

But the label is hardcoded (line 238):

```tsx
<Button onClick={onMiddleAction}>
  Next                           // ← Always "Next", even on last question
</Button>
```

There IS an `aria-describedby` hint for screen readers ("Opens review and submit") at lines 234-236, which shows the team was aware of the semantic mismatch but only addressed it for assistive technology, not visually.

### Contrast with post-exam review

`PostExamReviewView` (`post-exam-review-view.tsx:154-170`) correctly swaps "Next" for "Finish review" on the last question. The exam-taking flow should follow the same pattern.

### Interaction contracts

The contracts (`interaction-contracts.md:118-124`) currently specify:

> Position 2 is the sequential progression control: `Next` on every question. On the last question, clicking `Next` enters the review stage.

This was a deliberate design choice. The rationale: "Finish exam" lives in the header as a persistent escape hatch, so the middle button can stay "Next" as a consistent sequential control. The last-question "Next" is the natural flow into review, distinct from the emergency "Finish exam" escape.

**This is defensible but creates cognitive friction.** The user sees "Next" and expects another question. When it instead transitions to a completely different screen (Review & Submit), the mismatch is jarring — especially since the post-exam review demonstrates the correct pattern.

---

## Proposed fix

Change the label on the last question to "Review & Submit" or "Review answers":

```typescript
<Button onClick={onMiddleAction}>
  {props.isLastSessionQuestion && props.onEndSession
    ? 'Review & Submit'
    : 'Next'}
</Button>
```

Update the interaction contracts to reflect the label change and remove the `aria-describedby` hint (no longer needed if the label is self-describing).

---

## Files affected

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-view.tsx:238` | Conditional label on last question |
| `docs/practice-engine/interaction-contracts.md` | Update contract for last-question label |
| `app/(app)/app/practice/components/practice-view.test.tsx` | Update label assertions |
| `app/(app)/app/practice/components/practice-view.browser.spec.tsx` | Update label assertions if any |

---

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Verified: label hardcoded as "Next" on all questions including last | Browser agent walkthrough + code trace at practice-view.tsx:238 |
| 2026-04-11 | Noted existing contract specified "Next" on all questions deliberately | interaction-contracts.md:118-124; escape hatch is in header |
| 2026-04-11 | Recommend changing label to "Review & Submit" on last question | Aligns with post-exam review pattern; eliminates cognitive friction |
