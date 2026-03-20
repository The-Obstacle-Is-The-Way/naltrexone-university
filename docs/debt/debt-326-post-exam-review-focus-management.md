# DEBT-326: Post-Exam Review Focus Management on Question Navigation

**Priority:** P3
**Created:** 2026-03-19
**Source:** BS-058 post-implementation audit
**Related:** [PostExamReviewView](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx)

---

## The Problem

When the user clicks Previous/Next or a navigator button in the post-exam review, the question content swaps in place but focus stays on the button that was clicked. Keyboard and screen-reader users may not realize the main content area has changed.

The controlled panel in `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:84-89` is focusable (`tabIndex={-1}`) and has `outline-none`, but that file currently has no React hook imports, no `useEffect`, no `useRef`, and no `.focus()` call.

## What The Current Code Actually Does Elsewhere

There is **not** an existing session-level focus handoff in the active exam flow that the post-exam review simply forgot to copy.

What exists today:

- `PracticeView` can accept `questionAreaRef?: React.RefObject<HTMLDivElement | null>` and applies it to the controlled panel in `app/(app)/app/practice/components/practice-view.tsx:41-42` and `app/(app)/app/practice/components/practice-view.tsx:356-360`
- the only live runtime caller that passes `questionAreaRef` is Quick Practice in `app/(app)/app/practice/quick/quick-practice-client.tsx:100`; the session runner in `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:261-318` does **not** pass one during active exam navigation
- the only nearby focus recovery in this slice is Quick Practice error recovery, where `usePracticeQuestionAnswerFlow` focuses the question area after an error-path reload in `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts:126-137`
- `getFocusRecoveryTransition` in that hook is error-path-only: it sets `pendingFocus` on `status === 'error'` and only returns `shouldFocus: true` when a later `ready` arrives with `pendingFocus === true`
- other review surfaces currently do **not** perform focus handoff on navigation: there is no `.focus()` or focus-management `useEffect` in `app/(app)/app/questions/[slug]/question-page-client.tsx`, `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx`, or `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`

So this debt is still real, but it is a **new accessibility gap in the post-exam review**, not a regression from an already-solved active-exam pattern.

## Parent State Flow

`PostExamReviewView` is rendered by `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`, but the selection state does not live in that component.

The actual state owner is `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts`, which stores `postExamReviewCurrentQuestionId` and updates it in `onNavigatePostExamReviewQuestion` via `setPostExamReviewCurrentQuestionId(questionId)` (`:109-110`, `:319-320`).

That state flows through:

- `usePracticeSessionReviewStage`
- `usePracticeSessionPageController`
- `PracticeSessionPageClient`
- `PracticeSessionPageView`
- `PostExamReviewView` as `currentQuestionId`

## Implementation Decision (2026-03-20)

### Focus target: the controlled panel itself

The panel (`id={controlledPanelId}`, `tabIndex={-1}`) already follows the standard WAI-ARIA pattern for a controlled content region. No new inner element needed.

### Screen reader announcement: dynamic `aria-label` on the panel

The panel itself currently has no `aria-label`, `aria-labelledby`, `role`, or landmark semantics. The only related semantics are `id={controlledPanelId}`, `tabIndex={-1}`, and navigator buttons that point at it with `aria-controls={controlledPanelId}`.

Adding `aria-label={`Question ${currentRow.order} of ${review.totalCount}`}` to the panel would not conflict with current markup. It would be additive, though it would overlap the visible "Question X of Y" text already rendered inside the panel.

### Visible focus treatment: repo-standard focus ring

Use the repo's current focus-visible pattern: `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`.

The original `focus-visible:ring-2 focus-visible:ring-ring` proposal is **not** the established live pattern in this codebase. Current app code uses `focus-visible:ring-ring/50 focus-visible:ring-[3px]` for focus-visible treatment, and both review navigators use `ring-[3px] ring-ring/50` for current-item emphasis.

The repo currently has no live use of `.focus({ focusVisible: true })`, so that should be treated as a new implementation choice to validate in browser mode, not an existing project convention.

### Concrete changes

**`post-exam-review-view.tsx`:**

The component is already a `'use client'` component on line 1 and currently imports no React hooks. This change would add `useEffect` + `useRef`.

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
    aria-label={`Question ${currentRow.order} of ${review.totalCount}`}
    className="space-y-6 outline-none focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
    tabIndex={-1}
  >
```

The `onNavigateQuestion` callback path already updates the state that feeds `currentQuestionId`; no new navigation state wiring is needed. The component change can stay local to `post-exam-review-view.tsx`, but tests will also need updates or additions.

### Skip-on-mount behavior

The `useEffect` fires on mount as well as on subsequent `currentQuestionId` changes. On the initial mount of the post-exam review (when the user finishes the exam and transitions to review), this focus movement is **desirable** — it places focus on the first question's content area rather than leaving it on the navigation controls or wherever it was before the view transitioned.

### Test strategy

The existing `post-exam-review-view.test.tsx` uses `renderToStaticMarkup`, which cannot test focus behavior (no DOM lifecycle, no `useEffect`). The focus-management behavior requires:

- **Static markup tests** (existing `*.test.tsx`): Verify the accessible-name attribute and repo-standard focus-visible classes are present in the rendered HTML. `renderToStaticMarkup` can already assert `aria-label` and class tokens in this repo.
- **Browser mode test** (`*.browser.spec.tsx`): Verify that after navigation the panel receives focus. The same directory already has browser specs (`exam-review-view.browser.spec.tsx`, `practice-session-page-view.browser.spec.tsx`), and the repo already uses focus assertions in browser mode (`components/mobile-nav.browser.spec.tsx` uses `toHaveFocus()` under `vitest-browser-react` + Chromium).
- `PostExamReviewView` has no runtime controller or server-action imports, so a direct browser-mode render can use fixture props without mocking controller modules.

## Acceptance Criteria

- [ ] `useEffect` in `PostExamReviewView` focuses the panel ref when `currentQuestionId` changes
- [ ] Panel keeps `id={controlledPanelId}` and `tabIndex={-1}`
- [ ] Panel has an accessible name with "Question X of Y" for screen reader announcement
- [ ] Panel uses repo-standard focus-visible classes: `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`
- [ ] Static markup test verifies the accessible-name attribute and focus-visible class presence
- [ ] Browser mode test verifies the panel receives focus after navigation
- [ ] Existing PostExamReviewView behavior (unanswered banner, verdict pills, feedback content) is unchanged
