# BUG-159: Review-Mode Hydration Flicker — Transient Submit UI Shown in Review Route

**Status:** Open
**Priority:** P3
**Date:** 2026-02-25
**Source:** [BS-033](../brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) (Problem 21)

---

## Description

When navigating to a question review page (e.g., from Dashboard → Recent Activity or History → Sessions), the page briefly renders submit-mode controls (Submit button, selectable choices) before the previous attempt data loads and the page transitions to read-only review state.

This is a flash of incorrect UI — the user sees an interactive question form for a fraction of a second before it becomes the expected read-only review.

**Observed behavior:**
1. User clicks "Review" on a previously-answered question
2. For ~100-300ms, the page shows: Submit button, selectable choice radio buttons, no feedback card
3. Previous attempt data loads asynchronously
4. Page transitions to: disabled choices, selected answer highlighted, feedback card visible, no Submit button

**Expected behavior:**
- Loading state shown until previous attempt data resolves
- OR: Review-mode controls rendered from the start (disabled choices, no Submit)

## Steps to Reproduce

1. Answer a question via Quick Practice
2. Navigate to Dashboard → Recent Activity
3. Click on the answered question to review it
4. Watch carefully on page load — brief flash of submit-mode UI before review-mode renders

The flicker is most noticeable on slower connections or when the attempt API response is delayed.

## Root Cause

`app/(app)/app/questions/[slug]/question-page-client.tsx:152-156,327-340` and `use-question-page-controller.ts:231-247`:

`QuestionView` initially renders with `submitResult = null` (line 137 of props type). The `loadPreviousAttempt` function runs asynchronously in `useQuestionPageController`. Until it resolves:

- `submitResult` is `null` → Submit button is visible (line 327-340: `!props.submitResult && !isSessionReviewReadOnly`)
- `correctChoiceId` is `null` → choices are not color-coded, appear interactive
- No feedback card rendered (line 277: `props.submitResult || sessionUnansweredReveal`)

The `isSessionReviewReadOnly` guard (line 156: `isReviewMode && hasSessionId`) correctly hides Submit for session review routes. The flicker happens in **standalone review** (`mode=review` without `sessionId`): these routes are not read-only by that guard, and they depend on async prior-attempt hydration to switch from attempt UI to review UI.

In normal in-app flows, `mode=review` is already present on Dashboard, Bookmarks, and History review links. The issue is not missing mode params; it is the transient pre-hydration render before `loadPreviousAttempt` resolves.

## Fix

**Option A: Show loading state until previous attempt resolves**

Add a `isLoadingPreviousAttempt` state to the controller. While loading, render a loading card instead of the question form.

**File:** `app/(app)/app/questions/[slug]/use-question-page-controller.ts`

```tsx
const [isLoadingPreviousAttempt, setIsLoadingPreviousAttempt] = useState(
  mode === 'review' // start as loading if we're in review mode
);
```

Set to `false` after `loadPreviousAttempt` resolves.

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx`

```tsx
// Don't render question form while loading previous attempt in review mode
if (isLoadingPreviousAttempt) {
  return <Card>Loading review…</Card>;
}
```

**Option B: Hide only Submit during review hydration (not recommended)**

A narrower patch can hide Submit while previous-attempt hydration is in-flight, but this still leaves transient interactive choice cards and creates split-state logic.

**Recommendation:** Option A for completeness. A dedicated review-hydration loading state prevents all transient incorrect UI (Submit, interactive choices, and missing feedback) while preserving fallback-to-attempt behavior if no prior attempt exists.

## Affected Files

| File | Change |
|------|--------|
| `app/(app)/app/questions/[slug]/use-question-page-controller.ts` | Add `isLoadingPreviousAttempt` state |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | Gate question rendering on previous attempt load in review mode |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | Add test for loading state in review mode |
| `app/(app)/app/questions/[slug]/use-question-page-controller.browser.spec.tsx` | Add browser-level assertion for review hydration transition (loading → hydrated review). |

## Verification

- [ ] Review mode from Dashboard: no flash of Submit button
- [ ] Review mode from Bookmarks: no flash of Submit button
- [ ] Review mode from History: no flash of Submit button
- [ ] Session review mode: no regression (already guarded by `isSessionReviewReadOnly`)
- [ ] Submit mode (Quick Practice, new question): Submit button works normally — no regression
- [ ] Loading state shows while previous attempt data loads
- [ ] After load: feedback card, disabled choices, and correct answer highlight all render correctly
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test --run` passes

## Related

- [BS-033](../brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) — Problem 21
- `use-question-page-controller.ts` — `loadPreviousAttempt` async flow
