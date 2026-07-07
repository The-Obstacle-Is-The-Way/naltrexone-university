# BUG-271: No Focus Management When Reaching Session Summary

**Status:** Open
**Severity:** P3
**Date:** 2026-06-30
**Confirmed:** 2026-06-30
**Component:** Practice / Session Lifecycle / Accessibility

---

## Summary

`SessionSummaryView` originally mounted with a fresh `<h1>Session Summary</h1>` and no focus management whatsoever — no `useRef`, no `.focus()`, no `autoFocus`. Every path that reaches it is a full unmount/remount of the previous view, so a screen-reader user got no proactive signal that they had landed on a new section and had to self-recover (e.g., by navigating to the next heading).

Manual Tutor-mode session end and automatic exam-timer expiry reach this view directly and immediately. Manual exam submission does **not** reach it directly: confirming the "Submit exam" dialog first transitions to `PostExamReviewView`, which already has its own deliberate focus management (shipped as DEBT-326) — the real originally-unmanaged transition for the exam path is a separate, later click on that view's plain "View Summary" button.

**Fix note (2026-07-07):** Implemented in branch; status remains **Open** pending deploy proof. The current implementation focuses the summary heading on mount via the existing focus helper and does not refocus on ordinary re-renders of an already-mounted summary.

## Reachability

Reachable on every session completion:
- Manual Tutor-mode session end → directly to `SessionSummaryView`, originally unmanaged.
- Automatic exam-timer expiry → directly to `SessionSummaryView`, originally unmanaged.
- Manual exam submission → to `PostExamReviewView` first (focus-managed, not a gap), then to `SessionSummaryView` only after the user clicks "View Summary" there — that click was the originally-unmanaged transition for this path.

## Reproduction

1. Start a practice session (any mode) using a screen reader or by tracking keyboard focus (e.g. via dev tools `document.activeElement`).
2. Reach `SessionSummaryView` via any of the three paths above.
3. Observe where DOM focus lands once it renders.

Expected: focus moves to the new `<h1>Session Summary</h1>` (or another sensible landmark within the summary), so assistive technology announces the page change.

Pre-fix actual: focus was not moved by anything in `SessionSummaryView` or its mounting points; it remained wherever it was (or was lost if the prior focused element was unmounted, e.g. the "View Summary" button itself, which is removed from the DOM by the same click that triggers the view swap).

## Root Cause

- Historical defect: all affected paths converged on `SessionSummaryView`, but the destination view did not move focus. The current branch fixes that inside [`session-summary-view.tsx`](<../../app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx#L49-L63>) with `headingRef`, a mount-only `useEffect`, `focusElementWithoutScroll`, and a `tabIndex={-1}` heading target.
- [`practice-session-page-view.tsx`](<../../app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx#L172-L179>) swaps Tutor-mode ended sessions to `SessionSummaryView` with no accompanying focus call. The path is `use-practice-session-review-stage.ts`'s `endTutorSession` → `endSession` → `examResults.setSummary`; for Tutor summaries, `use-practice-session-exam-results-continuity.ts` leaves `examResultsSubstage` as `null`, and `PracticeSessionPageView`'s non-exam `summary` branch renders the summary.
- Exam summaries render through [`practice-session-exam-results-renderer.tsx`](<../../app/(app)/app/practice/[sessionId]/components/practice-session-exam-results-renderer.tsx#L52-L74>): when `summary?.mode === 'exam'` and the substage is not `post_exam_review`, it returns `SessionSummaryView`; focus is now handled inside the destination component rather than at each caller.
- For manual exam submission, [`exam-review-view.tsx`](<../../app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx#L263-L283>)'s "Confirm submit" `AlertDialogAction` invokes `onFinalizeReview()`, which transitions to **`PostExamReviewView`**, not `SessionSummaryView` — that view already manages its own focus (`panelRef` + `focusElementWithoutScroll`, shipped as `docs/_archive/debt/debt-326-post-exam-review-focus-management.md`). The actual originally-unmanaged transition was [`post-exam-review-view.tsx`](<../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx#L91-L98>)'s plain `<Button onClick={onViewSummary}>View Summary</Button>` (also [`post-exam-review-view.tsx#L193-L199`](<../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx#L193-L199>)), which calls into [`use-practice-session-exam-results-continuity.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.ts#L185-L190>)'s `onViewSummary` → `setSummary` → `setExamResultsSubstage('session_summary')` — the same exam-summary render path, just reached one click later.
- [`use-practice-session-page-model.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L232-L306>) wires automatic exam-timer expiry (`finalizeExpiredExam`, used as `onExpire`) through `reviewStage.finalizeExamSession(finalDraftAnswer)`, then renders `ExamTimer` while the active exam is not in review/summary substages. Expiry lands in the same exam-summary renderer directly, with no dialog or intermediate view involved at all.

This codebase already has established, working precedent for exactly this class of fix, on two separate views: [`practice-session-page-view.tsx`](<../../app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx#L90-L106>) (`questionAreaRef`, used by `restoreQuestionPanel` for in-session question navigation) and `PostExamReviewView` itself ([`post-exam-review-view.tsx#L64-L74`](<../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx#L64-L74>) plus [`post-exam-review-view.tsx#L111-L117`](<../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx#L111-L117>)). Neither pattern needs to be reused verbatim: `restoreQuestionPanel`'s `shouldRestoreQuestionPanelRef`/`lastQuestionIdRef` gating exists specifically to distinguish "the same persistently-mounted `PracticeView` got new question data" from "an unrelated re-render" — a concern specific to a component that stays mounted across in-session navigation. `SessionSummaryView` mounts fresh exactly once per session-end, so a plain unconditional mount-effect is the correct analog, not the flag-gated version.

## Impact

A screen-reader user who finishes a session is not proactively informed that they have arrived at a new section (the Session Summary) and must self-recover, e.g. by pressing a heading-navigation shortcut. The heading and content are present and reachable, so this is a best-practice gap rather than a hard blocking failure — no task is left incomplete, but the experience is noticeably degraded relative to a sighted user, who sees the visual transition immediately. This matches this repo's own P3 precedent for the same issue class (`docs/_archive/debt/debt-166-practice-view-missing-focus-management-after-error.md`, `debt-326` above — both "no DOM focus movement on view change, screen-reader-only impact, zero data/functional harm," both graded P3).

## Proposed Fix

Implemented in this branch: `SessionSummaryView` now owns a `headingRef` and a mount-only effect that calls the existing `focusElementWithoutScroll` helper against the summary `<h1>` ([`session-summary-view.tsx#L49-L63`](<../../app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx#L49-L63>)). The heading uses `tabIndex={-1}` and the existing `outline-none ring-focus` precedent, matching the focusable panel pattern already used by `PracticeView` ([`practice-view.tsx#L449-L456`](<../../app/(app)/app/practice/components/practice-view.tsx#L449-L456>)) and `PostExamReviewView` ([`post-exam-review-view.tsx#L111-L117`](<../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx#L111-L117>)). This covers all three paths because they converge on the same `SessionSummaryView` mount; ordinary re-renders of an already-mounted summary do not remount the component and therefore do not steal focus.

Rejected alternatives:
- **Rely on Radix's dialog `onCloseAutoFocus` for the confirm-submit path.** Does not apply: that dialog transitions to `PostExamReviewView` (already focus-managed), not `SessionSummaryView` — the actual gap for the exam path is a plain button click with no dialog involved.
- **Announce the transition via a live region instead of moving focus.** Live regions are appropriate for incidental updates to content the user is already viewing; a full view replacement (arriving at a new "page" within the session) is the canonical case for focus movement, not just an announcement.

## Regression Coverage

Browser-mode regression coverage now asserts: Tutor summary render focuses the summary heading, exam summary render focuses the heading, the post-exam "View Summary" transition focuses the heading, an already-mounted summary re-render does not steal focus, and the existing `PostExamReviewView` panel focus behavior remains green.

## Related

- Builds on the same focus-management pattern already shipped for in-session navigation (`questionAreaRef`/`restoreQuestionPanel`) and post-exam review (DEBT-326's `panelRef`/`focusElementWithoutScroll`) — this fix should reuse that precedent's intent (move focus on a real view change), not its exact gating mechanism.
- Distinct from BUG-272 (exam-timer milestone announcements), which covers a different a11y gap on the same general session-lifecycle surface.
