# BUG-153: "Try Again" Label Shown for Correct Answers on Dashboard and Bookmarks Review

**Status:** Open
**Priority:** P3
**Date:** 2026-02-25
**Source:** [BS-033](../brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) (Residual section), [BS-034](../brainstorming/bs-034-history-questions-tab-review-navigator-mismatch.md) (Related UX #3)

---

## Description

When reviewing a correctly-answered question from Dashboard or Bookmarks, the reattempt button says **"Try Again"** instead of **"Practice Again"**. The History Questions review path correctly shows "Practice Again" for correct answers.

"Try Again" implies the user got it wrong and should retry. "Practice Again" correctly communicates that the answer was right and the user can practice more if they want.

**Observed behavior:**
- Dashboard review of a correct answer → button says "Try Again"
- Bookmarks review of a correct answer → button says "Try Again"
- History Questions review of a correct answer → button says "Practice Again" (correct)

**Expected behavior:**
- ALL standalone review of a correct answer → button says "Practice Again"
- ALL standalone review of an incorrect answer → button says "Try Again"

## Steps to Reproduce

1. Answer a question correctly via Quick Practice
2. Navigate to Dashboard → Recent Activity
3. Click on the correctly-answered question to review it
4. Observe: reattempt button says "Try Again" (should say "Practice Again")
5. Navigate to Bookmarks → bookmark the same question → review it
6. Observe: same "Try Again" label on a correct answer

## Root Cause

`app/(app)/app/questions/[slug]/question-page-client.tsx:157,185-188`:

```tsx
const isStandaloneHistoryReview = props.origin === 'history' && !hasSessionId;
// ...
const reattemptLabel =
  isStandaloneHistoryReview && props.submitResult?.isCorrect
    ? 'Practice Again'
    : 'Try Again';
```

The label condition gates on `isStandaloneHistoryReview`, which requires `origin === 'history'`. Dashboard (`origin === 'dashboard'`) and Bookmarks (`origin === 'bookmarks'`) are both standalone review contexts but are excluded by this condition, so they always fall through to "Try Again".

**Context:** [SPEC-034](../_archive/specs/spec-034-review-mode-readonly-and-try-again-scoping.md) and [SPEC-036](../_archive/specs/spec-036-bookmark-review-mode-alignment.md) cleaned up major reattempt issues (hiding Try Again in session review, bookmarks review-first mode). This is a residual label bug that slipped through.

## Fix

Replace the origin-gated condition with one that keys off correctness alone:

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx:185-188`

```diff
-const reattemptLabel =
-  isStandaloneHistoryReview && props.submitResult?.isCorrect
-    ? 'Practice Again'
-    : 'Try Again';
+const reattemptLabel = props.submitResult?.isCorrect
+  ? 'Practice Again'
+  : 'Try Again';
```

**Why this is safe:** The "Try Again" / "Practice Again" button is only rendered when `props.submitResult && !isSessionReviewReadOnly` (line 342). Session review contexts already hide this button entirely via the `isSessionReviewReadOnly` guard. So the label logic only applies to standalone flows (Dashboard, Bookmarks, History) where correctness-based labeling is always appropriate.

After this fix, `isStandaloneHistoryReview` is only used at line 157 as a declaration. If no other code references it, it can be removed as dead code.

## Affected Files

| File | Change |
|------|--------|
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | Simplify `reattemptLabel` condition (lines 185-188). Optionally remove `isStandaloneHistoryReview` if unused. |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | Update label assertions for Dashboard/Bookmarks review to expect "Practice Again" on correct answers |
| `tests/e2e/review-mode-audit.spec.ts` | Update review-mode label assertions that currently expect `Try Again` for dashboard/bookmark review on correct answers. |

## Verification

- [ ] Dashboard review of correct answer → button says "Practice Again"
- [ ] Dashboard review of incorrect answer → button says "Try Again"
- [ ] Bookmarks review of correct answer → button says "Practice Again"
- [ ] Bookmarks review of incorrect answer → button says "Try Again"
- [ ] History Questions review of correct answer → button says "Practice Again" (no regression)
- [ ] History Questions review of incorrect answer → button says "Try Again" (no regression)
- [ ] Session review → reattempt button NOT shown (no regression)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test --run` passes

## Related

- [BS-033](../brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) — Residual section documents this bug
- [BS-034](../brainstorming/bs-034-history-questions-tab-review-navigator-mismatch.md) — Related UX Inconsistencies #3
- [SPEC-034](../_archive/specs/spec-034-review-mode-readonly-and-try-again-scoping.md) — Review Mode Readonly and Try Again Scoping
- [SPEC-036](../_archive/specs/spec-036-bookmark-review-mode-alignment.md) — Bookmark Review Mode Alignment
