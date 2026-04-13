# DEBT-360: Action Bar Below Fold on Exam and Post-Exam Review Screens

**Priority:** P2
**Created:** 2026-04-11
**Status:** Resolved
**Resolved:** 2026-04-12 via [PR #278](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/278)
**Affected surfaces:** PracticeView (exam questions), PostExamReviewView (post-exam review)
**Verified by:** Browser walkthrough on 2026-04-11 at a 1280x1100 viewport, then traced against the current source

---

## Problem

Both exam-taking and post-exam review place their primary action bars at the end of variable-height content. On longer questions or longer feedback blocks, the user has to scroll to discover the main navigation controls.

### Surface 1: Exam question-taking

**File:** [practice-view.tsx](../../../app/(app)/app/practice/components/practice-view.tsx)

The bottom action bar is rendered as:

```tsx
<div className="flex flex-wrap items-center gap-3" data-testid="bottom-action-bar">
  ...
</div>
```

It sits after `QuestionSurfaceBody` inside a top-level `space-y-6` stack. There is no sticky or fixed treatment.

### Surface 2: Post-exam review

**File:** [post-exam-review-view.tsx](../../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx)

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
- the app shell adds `py-8` on the shared `<main>` container in [app layout](../../../app/(app)/app/layout.tsx), which slightly increases the total scroll distance

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

## Shipped Resolution

DEBT-360 shipped as a hybrid of Option A and Option B:

- shared [`StickyActionBarLayout`](../../../app/(app)/app/practice/components/sticky-action-bar.tsx) provides a viewport-bounded shell plus a scrollable content region
- shared [`StickyActionBar`](../../../app/(app)/app/practice/components/sticky-action-bar.tsx) provides the sticky footer chrome (`sticky bottom-0`, border, backdrop blur, safe-area padding)
- shared [`AppLayoutShell`](../../../app/(app)/app/layout.tsx) now uses a flex-column `min-h-screen` shell with the banner and header above a `flex-1` `<main>` region, so [`StickyActionBarLayout`](../../../app/(app)/app/practice/components/sticky-action-bar.tsx) can fill the remaining viewport without top-chrome math
- [`PracticeView`](../../../app/(app)/app/practice/components/practice-view.tsx) and [`PostExamReviewView`](../../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx) both render their existing footer controls through that shared shell

This shipped approach keeps the footer visible without introducing a `fixed` overlay, while avoiding the failure mode of a pure end-of-document sticky wrapper that still remains below the fold until the user scrolls to it.

---

## Files Affected

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/sticky-action-bar.tsx` | Shared sticky footer + viewport shell for practice/review surfaces |
| `app/(app)/app/layout.tsx` | Publishes the app-shell viewport offset CSS variable consumed by the shared sticky shell |
| `app/(app)/app/practice/components/practice-view.tsx` | Route active-session footer through the shared shell |
| `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx` | Route the post-exam review footer through the shared shell |
| `app/(app)/app/practice/components/sticky-action-bar.test.tsx` | Shared sticky footer contract test |
| `app/(app)/app/practice/components/practice-view.browser.spec.tsx` | Structural marker coverage for the shared sticky shell on exam/tutor surfaces |
| `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.browser.spec.tsx` | Structural marker coverage for the shared sticky shell on the post-exam review surface |
| `tests/e2e/practice.spec.ts` | Real-CSS viewport assertions proving the footer remains visible on tutor, exam, and post-exam review flows |

The targeted sweep also verified that downstream `PracticeSessionPageView` browser coverage still passes with the shared shell in place.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Grouped exam-taking and post-exam review under one debt item | Both surfaces share the same footer-placement problem. |
| 2026-04-11 | Corrected the root-cause description | The issue is document-flow footer placement, not a large `space-y-6` gap. |
| 2026-04-11 | Kept severity at P2 | The primary navigation controls are discoverability-critical in a core flow. |
| 2026-04-12 | Shipped a hybrid shared-shell solution instead of a pure end-of-document sticky wrapper | Pure `sticky bottom-0` on a footer that still rendered after the full content stack did not keep the controls visible. A viewport-bounded scroll region plus shared sticky footer solved the real problem without resorting to `fixed`. |
| 2026-04-12 | Replaced browser-spec geometry shims with Playwright viewport checks | Isolated component browser specs do not load the app's compiled CSS, so viewport geometry must be proven in a real browser with the production stylesheet. |
