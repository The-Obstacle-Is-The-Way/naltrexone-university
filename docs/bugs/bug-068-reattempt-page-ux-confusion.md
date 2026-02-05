# BUG-068: Reattempt Page UX Confusion - Buttons After Submit

**Status:** Open
**Priority:** P3
**Date:** 2026-02-05

---

## Description

On the question reattempt page (`/app/questions/[slug]`), after submitting an answer, the UI shows both a disabled "Submit" button AND a "Reattempt" button. This creates confusion about what the user should do next.

**Current Flow:**
1. User clicks "Reattempt" on a missed question from Review page
2. Goes to `/app/questions/[slug]`
3. Page shows "Question" heading with subtitle "Reattempt a question from your review list"
4. User selects answer and clicks "Submit"
5. Feedback shows (Correct/Incorrect with explanation)
6. **Problem:** Both "Submit" (disabled) and "Reattempt" buttons visible

**User Confusion:**
- "I already submitted, why is Submit still there?"
- "What does Reattempt do if I'm already reattempting?"
- "How do I get back to the Review list?"

---

## Steps to Reproduce

1. Sign in as subscribed user
2. Go to `/app/review`
3. Click "Reattempt" on any missed question
4. Select an answer and click "Submit"
5. Observe button state after submission

---

## Root Cause

The `QuestionView` component in `question-page-client.tsx` always renders both buttons:

```tsx
<Button disabled={!canSubmit || isPending} onClick={onSubmit}>
  Submit
</Button>

{submitResult ? (
  <Button variant="outline" onClick={onReattempt}>
    Reattempt
  </Button>
) : null}
```

After submitting, `canSubmit` is false (disables Submit), but button remains visible.

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx:108-132`

---

## Fix

Option A (Recommended): Hide Submit after answering, add "Back to Review"
```tsx
{!submitResult ? (
  <Button disabled={!canSubmit || isPending} onClick={onSubmit}>
    Submit
  </Button>
) : null}

{submitResult ? (
  <>
    <Button variant="outline" onClick={onReattempt}>
      Try Again
    </Button>
    <Button asChild variant="ghost">
      <Link href="/app/review">Back to Review</Link>
    </Button>
  </>
) : null}
```

Option B: Change button text dynamically
- Before submit: "Submit"
- After submit: Show only "Try Again" and "Back to Review"

---

## Verification

- [ ] Submit button hidden after answering
- [ ] "Try Again" button appears after answering
- [ ] "Back to Review" link available after answering
- [ ] Can reattempt same question multiple times
- [ ] Correct answer removes question from Review list

---

## Related

- DEBT-106: Exam Mode Missing "Mark for Review" Feature
- Review page: `app/(app)/app/review/page.tsx`
