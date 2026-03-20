# DEBT-326: Post-Exam Review Focus Management on Question Navigation

**Priority:** P3
**Created:** 2026-03-19
**Source:** BS-058 post-implementation audit
**Related:** [PostExamReviewView](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx)

---

## The Problem

When the user clicks Previous/Next or a navigator button in the post-exam review, the question content swaps in place but focus stays on the button that was clicked. Keyboard and screen-reader users may not realize the main content area has changed.

The controlled panel in `post-exam-review-view.tsx:84-89` is focusable (`tabIndex={-1}`) and has `outline-none`, but there is no `useEffect`, no `.focus()` call, and no other post-navigation focus handoff in that file.

## What The Current Code Actually Does Elsewhere

There is **not** an existing session-level focus handoff in the active exam flow that the post-exam review simply forgot to copy.

What exists today:

- `PracticeView` can accept a `questionAreaRef` (`practice-view.tsx:356-360`), but the session runner does not pass one during active exam navigation
- the only nearby focus recovery in this slice is Quick Practice error recovery, where `usePracticeQuestionAnswerFlow` focuses the question area after an error-path reload (`use-practice-question-answer-flow.ts:126-136`)

So this debt is still real, but it is a **new accessibility gap in the post-exam review**, not a regression from an already-solved active-exam pattern.

## Implementation Decision (2026-03-20)

### Focus target: the controlled panel itself

The panel (`id={controlledPanelId}`, `tabIndex={-1}`) already follows the standard WAI-ARIA pattern for a controlled content region. No new inner element needed.

### Screen reader announcement: dynamic `aria-label` on the panel

Add `aria-label={`Question ${currentRow.order} of ${review.rows.length}`}` to the panel div. When focus lands, the screen reader announces the position. This is simpler and more reliable than a separate `aria-live="polite"` region, which can sometimes double-announce alongside the focus event.

### Visible focus treatment: `focus-visible` ring + `focusVisible: true`

Replace `outline-none` with `outline-none focus-visible:ring-2 focus-visible:ring-ring` on the panel. In the `useEffect`, call `.focus({ focusVisible: true })` instead of plain `.focus()`. Programmatic `.focus()` alone does not trigger `:focus-visible` in browsers; `.focus({ focusVisible: true })` does (Chrome 122+, Firefox 104+, Safari 17.4+ — all well past baseline for a 2026 app). This means the ring appears after keyboard/programmatic navigation but not after mouse clicks.

### Concrete changes

**`post-exam-review-view.tsx`:**

The component is already a `'use client'` component but currently uses no hooks. This change adds `useEffect` + `useRef`.

```tsx
'use client';

import { useEffect, useRef } from 'react';

// ... existing imports ...

export function PostExamReviewView({ ... }: PostExamReviewViewProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus({ focusVisible: true });
  }, [currentQuestionId]);

  // ... existing JSX ...

  // Panel div changes:
  <div
    id={controlledPanelId}
    ref={panelRef}
    aria-label={`Question ${currentRow.order} of ${review.rows.length}`}
    className="space-y-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    tabIndex={-1}
  >
```

No changes needed to any other file. The `onNavigateQuestion` callback already updates `currentQuestionId` in the parent, which triggers a re-render with the new prop value, which fires the `useEffect`.

### Skip-on-mount behavior

The `useEffect` fires on mount as well as on subsequent `currentQuestionId` changes. On the initial mount of the post-exam review (when the user finishes the exam and transitions to review), this focus movement is **desirable** — it places focus on the first question's content area rather than leaving it on the navigation controls or wherever it was before the view transitioned.

### Test strategy

The existing `post-exam-review-view.test.tsx` uses `renderToStaticMarkup`, which cannot test focus behavior (no DOM lifecycle, no `useEffect`). The focus-management behavior requires:

- **Static markup tests** (existing `*.test.tsx`): Verify `aria-label` attribute and `focus-visible:ring-2` class are present in the rendered HTML. These are structural assertions that `renderToStaticMarkup` can handle.
- **Browser mode test** (`*.browser.spec.tsx`): Verify that after navigation, `document.activeElement` is the panel element. This requires a real browser DOM with `useEffect` execution.

## Acceptance Criteria

- [ ] `useEffect` in `PostExamReviewView` calls `.focus({ focusVisible: true })` on the panel ref when `currentQuestionId` changes
- [ ] Panel has `aria-label` with "Question X of Y" for screen reader announcement
- [ ] Panel has `focus-visible:ring-2 focus-visible:ring-ring` so the focus destination is perceivable
- [ ] Static markup test verifies `aria-label` and focus-visible class presence
- [ ] Browser mode test verifies `document.activeElement` is the panel after navigation
- [ ] Existing PostExamReviewView behavior (unanswered banner, verdict pills, feedback content) is unchanged
