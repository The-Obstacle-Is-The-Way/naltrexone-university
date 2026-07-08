# BUG-272: Exam-Timer Milestone Announcements Can Be Silently Skipped Across a Backgrounded Tab

**Status:** Open
**Severity:** P4
**Date:** 2026-06-30
**Confirmed:** 2026-06-30
**Component:** Practice / Exam Timer / Accessibility

---

## Summary

The exam timer announces "5 minutes remaining" / "1 minute remaining" / "30 seconds remaining" via a visually-hidden (`sr-only`), `aria-live="polite"` region — this is a screen-reader-only feature; sighted users have no equivalent announcement and are unaffected by this bug (see Impact). The original check was an exact-equality comparison against the current `remainingSeconds` value, with no tracking of whether a threshold was crossed since the last check. The timer recomputes `remainingSeconds` from `Date.now()` whenever the tab regains visibility/focus (in addition to its 1-second interval), so a screen-reader user who backgrounded the exam tab across one of these exact values never received that milestone's announcement — it was simply skipped, not deferred. The safety-critical final "time is up" announcement is structurally immune to this same gap (it is a floor/level condition via `Math.max(0, ...)`, not an exact-equality point condition, so it cannot be "jumped past"), so no exam can fail to warn at expiry; only the non-critical advance warnings could be lost.

**Fix note (2026-07-07):** Implemented in branch; status remains **Open** pending deploy proof. The current implementation announces on threshold crossing in `use-exam-timer.ts` and keeps the existing `sr-only` live-region markup in `exam-timer.tsx`.

## Reachability

Reachable only by an exam-taker using a screen reader or other assistive technology that consumes the `aria-live` milestone region, who backgrounds or switches away from the exam tab for long enough that the next visibility/focus/interval check finds `remainingSeconds` has already passed one or more of the 300/60/30-second milestones without ever equaling them exactly. Sighted users cannot be affected under any sequence of events: the milestone text lives in a visually-hidden `sr-only` span, and the always-visible countdown digits and warning-color styling are computed independently and are untouched by this gap.

## Reproduction

1. Start an exam session with more than 6 minutes remaining, using a screen reader.
2. Background the browser tab (switch tabs or apps) for longer than necessary to cross the 5-minute mark — e.g. background it when 5 minutes and 30 seconds remain, and return after 4 minutes have remained.
3. Return focus to the tab and listen for the milestone announcement.

Expected: the user is still informed, on return, that they are inside the 5-minute warning window.

Pre-fix actual: `remainingSeconds` jumped directly from a value above 300 to a value below 300 on the recompute triggered by `visibilitychange`/`focus`, so `remainingSeconds === 300` was never true at any check, and the "5 minutes remaining" announcement never fired for that session. The same could happen independently for the 60- and 30-second milestones.

## Root Cause

- Historical defect: `exam-timer.tsx` previously derived milestone text from the current `remainingSeconds` value only. The current branch replaces that with a hook-supplied `milestoneAnnouncement` prop ([`exam-timer.tsx#L5-L9`](<../../app/(app)/app/practice/components/exam-timer.tsx#L5-L9>)) rendered inside the same visually hidden polite live region ([`exam-timer.tsx#L42-L44`](<../../app/(app)/app/practice/components/exam-timer.tsx#L42-L44>)).
- [`use-exam-timer.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-exam-timer.ts#L93-L141>) (`update`) still recomputes `remainingSeconds` fresh via `computeState(deadlineMs, previousRemainingSeconds)` → `computeRemainingSeconds(deadlineMs, Date.now())` every time it runs — on the 1-second `setInterval` and on `visibilitychange`/`focus` events. After a tab has been backgrounded, the next `update()` call can jump `remainingSeconds` past one or more milestone values in a single step; the new refs at [`use-exam-timer.ts#L76-L102`](<../../app/(app)/app/practice/[sessionId]/hooks/use-exam-timer.ts#L76-L102>) preserve the previous observed value for that comparison.
- The implemented crossing detector lives at [`use-exam-timer.ts#L22-L51`](<../../app/(app)/app/practice/[sessionId]/hooks/use-exam-timer.ts#L22-L51>): it fires when `previous > threshold >= current`, suppresses stale milestone text at expiry (`remainingSeconds === 0`), and returns only the lowest threshold crossed in a long jump by comparing threshold values rather than relying on milestone array order.
- By contrast, the final expiry announcement remains structurally robust against this same jump: `computeRemainingSeconds` clamps via `Math.max(0, ...)` ([`use-exam-timer.ts#L18-L19`](<../../app/(app)/app/practice/[sessionId]/hooks/use-exam-timer.ts#L18-L19>)), making `isExpired` (`remainingSeconds === 0`) a floor condition that cannot be skipped past, further guarded by the unchanged `firedDeadlineMsRef` dedup and retry reset path ([`use-exam-timer.ts#L103-L125`](<../../app/(app)/app/practice/[sessionId]/hooks/use-exam-timer.ts#L103-L125>)).

**Fix location matters and is not obvious from the file names alone.** The tracking cannot live inside `ExamTimer` (`exam-timer.tsx`) itself, because that component unmounts and remounts independently of the underlying timer: [`practice-view.tsx#L405`](<../../app/(app)/app/practice/components/practice-view.tsx#L405>) renders `{isExamMode ? props.examTimer : null}`, and [`use-practice-session-page-model.ts#L288-L306`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L288-L306>) sets `isTimerActive` false (unmounting `ExamTimer`) whenever the review/summary substages are active — i.e., during the Review & Submit screen, the same interaction previously documented and fixed as `docs/_archive/bugs/bug-255-review-submit-screen-stops-exam-timer.md`. If "last seen" tracking lived in a ref inside `ExamTimer`, it would reset to nothing on every one of these remounts, silently worse than the original bug rather than fixing it. The tracking now lives in `use-exam-timer.ts`'s hook state, which persists across exactly these mount cycles — the same reason the existing `firedDeadlineMsRef` already works reliably today. The fix widened the `ExamTimerState`/`ExamTimerProps` contract so the hook computes and exposes `milestoneAnnouncement`, and `exam-timer.tsx` renders that derived field directly.

## Impact

A screen-reader user who backgrounds the exam tab across a milestone gets no advance warning at all for that threshold; their next signal may be the assertive "Time is up. Submitting your exam." with no lead time to react. The exam still finalizes correctly and no answers or time are lost (this is purely a courtesy-reminder gap, not data loss or incorrect grading), sighted users are entirely unaffected, and one or more of the three non-critical reminders can be skipped under the narrow precondition of a sufficiently long background period crossing the relevant exact threshold(s). This matches this repo's own P4 precedent for the same announcement-timing category — distinct from the DOM-focus-movement category (BUG-271, DEBT-166, DEBT-326) that this repo does grade P3 — namely the already-known "answer-verdict live-region announcement timing" item (`docs/bugs/index.md`: "One accessibility P4... under separate owner review").

## Proposed Fix

Implemented in this branch: `use-exam-timer.ts` tracks the last-seen `remainingSeconds` for the active deadline and computes a crossed milestone if the new value is at-or-below a threshold while the previously recorded value was above it ([`use-exam-timer.ts#L22-L67`](<../../app/(app)/app/practice/[sessionId]/hooks/use-exam-timer.ts#L22-L67>)). If one update crosses multiple thresholds, the detector returns only the lowest crossed milestone by comparing threshold values; if the update reaches zero, the milestone is suppressed so the existing assertive expiry announcement owns that moment. `ExamTimerState` and `ExamTimerProps` now include `milestoneAnnouncement`, and `exam-timer.tsx` renders it directly in the pre-existing polite live region ([`exam-timer.tsx#L42-L44`](<../../app/(app)/app/practice/components/exam-timer.tsx#L42-L44>)).

Rejected alternatives:
- **Re-announce the nearest passed milestone on every `visibilitychange`/focus return.** Could produce confusing or redundant announcements (e.g. announcing "30 seconds remaining" on return when 5 minutes had already elapsed since backgrounding); a single, threshold-crossed-once announcement per milestone is clearer.
- **Track "last seen" state inside `ExamTimer` (`exam-timer.tsx`) itself.** Would not survive the component's own remount cycles during Review & Submit (see Root Cause), making the fix unreliable in exactly the scenario it's meant to cover.

## Regression Coverage

Browser-mode hook regression coverage now asserts: a jump from above a threshold to below it announces the crossed milestone once, a jump crossing multiple thresholds announces only the lowest crossed milestone, a normal second-by-second countdown announces each milestone exactly once, and the existing expiry latch/retry specs remain green. The presentational `ExamTimer` jsdom coverage now asserts that the component renders the hook-provided milestone text into the existing `sr-only` polite live region.

## Related

- Distinct from BUG-271 (no focus management on session-end transition) — both are accessibility gaps on the practice/exam session lifecycle surface but affect different mechanisms (live-region announcement timing vs. DOM focus movement), and this repo grades the two categories differently (P4 vs P3 respectively).
- `docs/_archive/bugs/bug-255-review-submit-screen-stops-exam-timer.md` is the precedent confirming `ExamTimer` genuinely unmounts during Review & Submit — load-bearing evidence for why the fix must live in the hook, not the component.
- Does not affect or regress the already-correct, separately-guarded final expiry announcement and exam finalization.
