# DEBT-360: Action Bar Below Fold on Exam and Post-Exam Review Screens

**Priority:** P2
**Created:** 2026-04-11
**Status:** Open
**Affected surfaces:** PracticeView (exam questions), PostExamReviewView (post-exam review)
**Verified by:** Claude-in-Chrome browser agent walkthrough (2026-04-11, 1280x1100 viewport)

---

## Problem

The primary action buttons (Next, Previous, Finish review, Bookmark) are in the document flow and render below the fold on reasonably-sized viewports. Users must scroll past all content to find the navigation controls.

### Surface 1: Exam question-taking (PracticeView)

**File:** `app/(app)/app/practice/components/practice-view.tsx:440-477`

The action bar (`data-testid="bottom-action-bar"`) is a regular `<div className="flex flex-wrap items-center gap-3">` at the end of a `<div className="space-y-6">` container. No sticky or fixed positioning.

On a 1280x1100 viewport with a long question stem and 5 answer choices, the Next/Previous/Mark for review buttons sit at or beyond the pixel edge of the viewport. The user must scroll past the last answer choice to discover the primary navigation.

### Surface 2: Post-exam review (PostExamReviewView)

**File:** `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:142-184`

Same layout pattern. The bottom buttons (Previous, Next/Finish review, Bookmark) sit after the content in a `<div className="space-y-6">` flow. The content above includes: score card (~120px) + question navigator (~150px) + question card + full feedback (explanation, clinical pearl, why-other-answers-wrong, reference — often 400-800px). The feedback section alone can be taller than the viewport.

The agent observed "hundreds of pixels of empty black space" between the last feedback text and the action buttons. This is the `space-y-6` gap (24px) between the last content section and the button bar, but because the content ends mid-viewport and the buttons are at the document bottom, the visual gap feels enormous.

### Root cause

Both surfaces share the same layout pattern:

```
<div className="space-y-6">          ← stacking container
  {/* header, navigator, content */}  ← variable height
  <div className="flex ...">          ← action bar, document flow
    <Button>Next</Button>
  </div>
</div>
```

The parent `<main>` in `app/(app)/app/layout.tsx:83-100` adds `py-8` (2rem top/bottom padding). Combined with `space-y-6` margin stacking and no sticky positioning, the action bar has no viewport awareness.

---

## Proposed fix

Make the action bar sticky at the bottom of the viewport with a subtle background blur, so it's always visible regardless of content length. This is a standard pattern for mobile-first action bars.

```tsx
<div className="sticky bottom-0 bg-background/80 backdrop-blur-sm border-t border-border/50 py-3 -mx-4 px-4">
  {/* buttons */}
</div>
```

Alternatively, restructure the layout so content scrolls within a constrained container and the action bar sits outside the scroll area. This is more complex but eliminates the scroll-to-find-buttons problem entirely.

**Important:** Both surfaces should use the same approach for consistency.

---

## Files affected

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-view.tsx:440-477` | Make action bar sticky |
| `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:142-184` | Make action bar sticky |
| Tests for both files | Update any layout-sensitive assertions |

---

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Verified via browser agent walkthrough | Action buttons at pixel edge of 1280x1100 viewport, hundreds of px dead space in review |
| 2026-04-11 | Grouped exam-taking and post-exam review surfaces | Same root cause (document-flow action bar), same fix pattern |
