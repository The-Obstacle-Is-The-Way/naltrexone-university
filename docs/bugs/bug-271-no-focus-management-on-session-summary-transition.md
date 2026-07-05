# BUG-271: No Focus Management When Reaching Session Summary

**Status:** Open
**Severity:** P3
**Date:** 2026-06-30
**Confirmed:** 2026-06-30
**Component:** Practice / Session Lifecycle / Accessibility

---

## Summary

`SessionSummaryView` mounts with a fresh `<h1>Session Summary</h1>` and no focus management whatsoever — no `useRef`, no `.focus()`, no `autoFocus`. Every path that reaches it is a full unmount/remount of the previous view, so a screen-reader user gets no proactive signal that they have landed on a new section and must self-recover (e.g., by navigating to the next heading).

Manual Tutor-mode session end and automatic exam-timer expiry reach this view directly and immediately. Manual exam submission does **not** reach it directly: confirming the "Submit exam" dialog first transitions to `PostExamReviewView`, which already has its own deliberate focus management (shipped as DEBT-326) — the real unmanaged transition for the exam path is a separate, later click on that view's plain "View Summary" button.

## Reachability

Reachable on every session completion:
- Manual Tutor-mode session end → directly to `SessionSummaryView`, unmanaged.
- Automatic exam-timer expiry → directly to `SessionSummaryView`, unmanaged.
- Manual exam submission → to `PostExamReviewView` first (focus-managed, not a gap), then to `SessionSummaryView` only after the user clicks "View Summary" there — that click is the unmanaged transition for this path.

## Reproduction

1. Start a practice session (any mode) using a screen reader or by tracking keyboard focus (e.g. via dev tools `document.activeElement`).
2. Reach `SessionSummaryView` via any of the three paths above.
3. Observe where DOM focus lands once it renders.

Expected: focus moves to the new `<h1>Session Summary</h1>` (or another sensible landmark within the summary), so assistive technology announces the page change.

Actual: focus is not moved by anything in `SessionSummaryView` or its mounting points; it remains wherever it was (or is lost if the prior focused element was unmounted, e.g. the "View Summary" button itself, which is removed from the DOM by the same click that triggers the view swap).

## Root Cause

- [`session-summary-view.tsx`](<../../app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx#L49-L51>) renders `<h1>Session Summary</h1>` with no `ref`/focus side effect anywhere in the component (confirmed: no `useRef`, `.focus(`, or `autoFocus` usage in this file).
- [`practice-session-page-view.tsx`](<../../app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx#L174>) swaps the rendered view to `SessionSummaryView` with no accompanying focus call, for both the Tutor-manual-end and exam-expiry paths — traced through `use-practice-session-review-stage.ts`'s `endTutorSession`/`finalizeExamSession`, both of which set `examResultsSubstage('session_summary')` directly.
- For manual exam submission, [`exam-review-view.tsx`](<../../app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx#L263-L283>)'s "Confirm submit" `AlertDialogAction` invokes `onFinalizeReview()`, which transitions to **`PostExamReviewView`**, not `SessionSummaryView` — that view already manages its own focus (`panelRef` + `focusElementWithoutScroll`, shipped as `docs/_archive/debt/debt-326-post-exam-review-focus-management.md`). The actual unmanaged transition is [`post-exam-review-view.tsx`](<../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx#L95>)'s plain `<Button onClick={onViewSummary}>View Summary</Button>` (also at line 196), which calls into `use-practice-session-exam-results-continuity.ts`'s `onViewSummary` → `setSummary` → `setExamResultsSubstage('session_summary')` — the same unmanaged view-swap point as the other two paths, just reached one click later.
- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L187-L228>) wires automatic exam-timer expiry (`finalizeExpiredExam`, used as `onExpire`) through the same unmanaged view-swap path directly, with no dialog or intermediate view involved at all.

This codebase already has established, working precedent for exactly this class of fix, on two separate views: [`practice-session-page-view.tsx`](<../../app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx#L90-L92>) (`questionAreaRef`, used by `restoreQuestionPanel` for in-session question navigation) and `PostExamReviewView` itself (`panelRef` + `focusElementWithoutScroll`, DEBT-326). Neither pattern needs to be reused verbatim: `restoreQuestionPanel`'s `shouldRestoreQuestionPanelRef`/`lastQuestionIdRef` gating exists specifically to distinguish "the same persistently-mounted `PracticeView` got new question data" from "an unrelated re-render" — a concern specific to a component that stays mounted across in-session navigation. `SessionSummaryView` mounts fresh exactly once per session-end, so a plain unconditional mount-effect is the correct analog, not the flag-gated version.

## Impact

A screen-reader user who finishes a session is not proactively informed that they have arrived at a new section (the Session Summary) and must self-recover, e.g. by pressing a heading-navigation shortcut. The heading and content are present and reachable, so this is a best-practice gap rather than a hard blocking failure — no task is left incomplete, but the experience is noticeably degraded relative to a sighted user, who sees the visual transition immediately. This matches this repo's own P3 precedent for the same issue class (`docs/_archive/debt/debt-166-practice-view-missing-focus-management-after-error.md`, `debt-326` above — both "no DOM focus movement on view change, screen-reader-only impact, zero data/functional harm," both graded P3).

## Proposed Fix

Add a ref to `SessionSummaryView`'s heading and move focus to it in a plain mount-only `useEffect(() => { ref.current?.focus(); }, [])`. The target element needs `tabIndex={-1}` added (matching the same pattern already used at `practice-view.tsx#L454` and `post-exam-review-view.tsx#L116`) — a plain `<h1>`/`<div>` is not natively focusable, so `.focus()` would silently no-op without it. This single change covers all three paths, since they all converge on the same `SessionSummaryView` mount.

Rejected alternatives:
- **Rely on Radix's dialog `onCloseAutoFocus` for the confirm-submit path.** Does not apply: that dialog transitions to `PostExamReviewView` (already focus-managed), not `SessionSummaryView` — the actual gap for the exam path is a plain button click with no dialog involved.
- **Announce the transition via a live region instead of moving focus.** Live regions are appropriate for incidental updates to content the user is already viewing; a full view replacement (arriving at a new "page" within the session) is the canonical case for focus movement, not just an announcement.

## Failing Test Sketch

```tsx
it('moves focus to the Session Summary heading when the session ends', async () => {
  const screen = await render(<PracticeSessionPageView {...endedSessionProps} />);
  await expect
    .element(screen.getByRole('heading', { name: 'Session Summary' }))
    .toHaveFocus();
});
```

Placed in a `.browser.spec.tsx` file using this repo's `vitest-browser-react` pattern (`expect.element(...).toHaveFocus()`), not `@testing-library/react`'s `render`/`screen`/`waitFor` (banned in this repo per `.claude/rules/testing-react19.md` — broken with React 19). Today this fails because nothing in `SessionSummaryView` or its mounting points ever calls `.focus()`.

## Related

- Builds on the same focus-management pattern already shipped for in-session navigation (`questionAreaRef`/`restoreQuestionPanel`) and post-exam review (DEBT-326's `panelRef`/`focusElementWithoutScroll`) — this fix should reuse that precedent's intent (move focus on a real view change), not its exact gating mechanism.
- Distinct from BUG-272 (exam-timer milestone announcements), which covers a different a11y gap on the same general session-lifecycle surface.
