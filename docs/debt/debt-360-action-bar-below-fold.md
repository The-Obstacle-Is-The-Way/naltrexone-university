# DEBT-360: Action Bar Below Fold on Exam and Post-Exam Review Screens

**Priority:** P2
**Created:** 2026-04-11
**Status:** Open
**Affected surfaces:** PracticeView (exam questions), PostExamReviewView (post-exam review)
**Verified by:** Browser walkthrough on 2026-04-11 at a 1280x1100 viewport, then traced against the current source

---

## Problem

Both exam-taking and post-exam review place their primary action bars at the end of variable-height content. On longer questions or longer feedback blocks, the user has to scroll to discover the main navigation controls.

### Surface 1: Exam question-taking

**File:** [practice-view.tsx](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/components/practice-view.tsx:439)

The bottom action bar is rendered as:

```tsx
<div className="flex flex-wrap items-center gap-3" data-testid="bottom-action-bar">
  ...
</div>
```

It sits after `QuestionSurfaceBody` inside a top-level `space-y-6` stack. There is no sticky or fixed treatment.

### Surface 2: Post-exam review

**File:** [post-exam-review-view.tsx](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:142)

The review footer uses the same document-flow pattern:

```tsx
<div className="flex flex-col gap-3 sm:flex-row">
  ...
</div>
```

That footer sits after:

- score banner
- question navigator
- question content
- full feedback block

As feedback grows, the action bar drops farther down the page.

---

## Root Cause

The underlying issue is not a giant CSS spacer. It is that both footers live after variable-height content with no viewport-aware treatment.

Contributing factors:

- `QuestionSurfaceBody` and `Feedback` can become tall
- the review page stacks several cards before the footer
- the app shell adds `py-8` on the shared `<main>` container in [app layout](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/layout.tsx:83), which slightly increases the total scroll distance

The earlier version of this debt doc overstated the visual gap as a `space-y-6` problem. The actual DOM gap is small; the discoverability problem comes from footer placement relative to the viewport.

---

## Proposed Fix

Make both action bars viewport-aware, using the same pattern on both surfaces.

### Option A: Sticky footer treatment

```tsx
<div className="sticky bottom-0 border-t border-border/50 bg-background/80 px-4 py-3 backdrop-blur-sm">
  ...
</div>
```

This is the lowest-friction fix, but it needs:

- enough bottom padding so content is not obscured behind the sticky bar
- mobile-safe spacing
- visual treatment consistent with the rest of the exam shell

### Option B: Split scrolling content from fixed actions

Keep content in a scrollable region and render the action bar outside that region. This is structurally cleaner but touches more layout code.

### Implementation guidance

Whichever option wins, the exam-taking surface and post-exam review surface should land on the same interaction pattern. The issue is shared, so the solution should be shared too.

---

## Files Affected

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-view.tsx` | Update the active-session action bar layout |
| `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx` | Update the post-exam review footer layout |
| `app/(app)/app/practice/components/practice-view.browser.spec.tsx` | Add or update visibility assertions for the footer controls |
| `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.browser.spec.tsx` | Add or update visibility assertions for the footer controls |

Unit tests for button presence may not need changes unless the wrapper structure or test IDs move.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Grouped exam-taking and post-exam review under one debt item | Both surfaces share the same footer-placement problem. |
| 2026-04-11 | Corrected the root-cause description | The issue is document-flow footer placement, not a large `space-y-6` gap. |
| 2026-04-11 | Kept severity at P2 | The primary navigation controls are discoverability-critical in a core flow. |
