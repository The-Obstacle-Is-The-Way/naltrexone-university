# BUG-272: Exam-Timer Milestone Announcements Can Be Silently Skipped Across a Backgrounded Tab

**Status:** Open
**Severity:** P4
**Date:** 2026-06-30
**Confirmed:** 2026-06-30
**Component:** Practice / Exam Timer / Accessibility

---

## Summary

The exam timer announces "5 minutes remaining" / "1 minute remaining" / "30 seconds remaining" via a visually-hidden (`sr-only`), `aria-live="polite"` region — this is a screen-reader-only feature; sighted users have no equivalent announcement and are unaffected by this bug (see Impact). The check is an exact-equality comparison against the current `remainingSeconds` value, with no tracking of whether a threshold was crossed since the last check. The timer recomputes `remainingSeconds` from `Date.now()` whenever the tab regains visibility/focus (in addition to its 1-second interval), so a screen-reader user who backgrounds the exam tab across one of these exact values never receives that milestone's announcement — it is simply skipped, not deferred. The safety-critical final "time is up" announcement is structurally immune to this same gap (it is a floor/level condition via `Math.max(0, ...)`, not an exact-equality point condition, so it cannot be "jumped past"), so no exam can fail to warn at expiry; only the non-critical advance warnings can be lost.

## Reachability

Reachable only by an exam-taker using a screen reader or other assistive technology that consumes the `aria-live` milestone region, who backgrounds or switches away from the exam tab for long enough that the next visibility/focus/interval check finds `remainingSeconds` has already passed one or more of the 300/60/30-second milestones without ever equaling them exactly. Sighted users cannot be affected under any sequence of events: the milestone text lives in a visually-hidden `sr-only` span, and the always-visible countdown digits and warning-color styling are computed independently and are untouched by this gap.

## Reproduction

1. Start an exam session with more than 6 minutes remaining, using a screen reader.
2. Background the browser tab (switch tabs or apps) for longer than necessary to cross the 5-minute mark — e.g. background it when 5 minutes and 30 seconds remain, and return after 4 minutes have remained.
3. Return focus to the tab and listen for the milestone announcement.

Expected: the user is still informed, on return, that they are inside the 5-minute warning window.

Actual: `remainingSeconds` jumps directly from a value above 300 to a value below 300 on the recompute triggered by `visibilitychange`/`focus`, so `remainingSeconds === 300` is never true at any check, and the "5 minutes remaining" announcement never fires for that session. The same can happen independently for the 60- and 30-second milestones.

## Root Cause

- [`exam-timer.tsx`](<../../app/(app)/app/practice/components/exam-timer.tsx#L22-L33>) (`getMilestoneAnnouncement`) uses exact equality: `remainingSeconds === EXAM_TIMER_MILESTONE_SECONDS.fiveMinutes` (and `.oneMinute`, `.thirtySeconds`) — a pure function of the *current* value only, with no memory of previously seen values. The milestone text is rendered at [`exam-timer.tsx#L62-L64`](<../../app/(app)/app/practice/components/exam-timer.tsx#L62-L64>) inside `<span className="sr-only" aria-live="polite">` — confirmed genuinely visually hidden, not a shared/dual-purpose element.
- [`use-exam-timer.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-exam-timer.ts#L51-L65>) (`update`) recomputes `remainingSeconds` fresh via `computeState(deadlineMs)` → `computeRemainingSeconds(deadlineMs, Date.now())` every time it runs — on the 1-second `setInterval` (line 71) **and** on `visibilitychange`/`focus` events (lines 72-73). After a tab has been backgrounded, the next `update()` call can jump `remainingSeconds` past one or more exact milestone values in a single step.
- By contrast, the final expiry announcement is structurally robust against this same jump: `computeRemainingSeconds` clamps via `Math.max(0, ...)`, making `isExpired` (`remainingSeconds === 0`) a floor condition that cannot be skipped past, further guarded by a `firedDeadlineMsRef` dedup so it fires exactly once. This part of the design is sound and needs no change.

**Fix location matters and is not obvious from the file names alone.** The tracking cannot live inside `ExamTimer` (`exam-timer.tsx`) itself, because that component unmounts and remounts independently of the underlying timer: [`practice-view.tsx#L405`](<../../app/(app)/app/practice/components/practice-view.tsx#L405>) renders `{isExamMode ? props.examTimer : null}`, and [`use-practice-session-page-model.ts#L218-L230`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L218-L230>) sets `isTimerActive` false (unmounting `ExamTimer`) whenever the review/summary substages are active — i.e., during the Review & Submit screen, the same interaction previously documented and fixed as `docs/_archive/bugs/bug-255-review-submit-screen-stops-exam-timer.md`. If "last seen" tracking lived in a ref inside `ExamTimer`, it would reset to nothing on every one of these remounts, silently worse than today's bug rather than fixing it. The tracking must live in `use-exam-timer.ts`'s hook state, which persists across exactly these mount cycles — the same reason the existing `firedDeadlineMsRef` already works reliably today. This also means the fix requires widening the `ExamTimerState`/`ExamTimerProps` contract between the two files: the hook renders no JSX, so it must compute and expose a new derived field (e.g. `milestoneAnnouncement: string | null`) for `exam-timer.tsx` to render, rather than `exam-timer.tsx` continuing to compute `getMilestoneAnnouncement` from its own prop.

## Impact

A screen-reader user who backgrounds the exam tab across a milestone gets no advance warning at all for that threshold; their next signal may be the assertive "Time is up. Submitting your exam." with no lead time to react. The exam still finalizes correctly and no answers or time are lost (this is purely a courtesy-reminder gap, not data loss or incorrect grading), sighted users are entirely unaffected, and one or more of the three non-critical reminders can be skipped under the narrow precondition of a sufficiently long background period crossing the relevant exact threshold(s). This matches this repo's own P4 precedent for the same announcement-timing category — distinct from the DOM-focus-movement category (BUG-271, DEBT-166, DEBT-326) that this repo does grade P3 — namely the already-known "answer-verdict live-region announcement timing" item (`docs/bugs/index.md`: "One accessibility P4... under separate owner review").

## Proposed Fix

Track the last-seen `remainingSeconds` in `use-exam-timer.ts`'s hook state (not in `exam-timer.tsx`, per the remount hazard above) and compute a crossed milestone if the new value is at-or-below a threshold while the previously-recorded value was above it — mirroring the level-triggered, dedup-guarded pattern already used for `firedDeadlineMsRef`. Widen `ExamTimerState` to expose this as a new field (e.g. `milestoneAnnouncement: string | null`) that `exam-timer.tsx` renders directly, replacing its own `getMilestoneAnnouncement(props.remainingSeconds)` call.

Rejected alternatives:
- **Re-announce the nearest passed milestone on every `visibilitychange`/focus return.** Could produce confusing or redundant announcements (e.g. announcing "30 seconds remaining" on return when 5 minutes had already elapsed since backgrounding); a single, threshold-crossed-once announcement per milestone is clearer.
- **Track "last seen" state inside `ExamTimer` (`exam-timer.tsx`) itself.** Would not survive the component's own remount cycles during Review & Submit (see Root Cause), making the fix unreliable in exactly the scenario it's meant to cover.

## Failing Test Sketch

Targeted at the hook, not the presentational component (a component-level test would exercise the wrong layer per the remount hazard above):

```tsx
it('still surfaces the 5-minute milestone after a visibilitychange-triggered jump that skips exactly 300', () => {
  const probe = renderExamTimerHook({ deadlineAt: /* ~320s out */ });
  advanceSystemClockBy(30_000); // now ~290s remain
  dispatchVisibilityChange();

  expect(probe.latest().milestoneAnnouncement).toBe('5 minutes remaining');
});
```

Today this fails because `use-exam-timer.ts` exposes no `milestoneAnnouncement` field at all, and `exam-timer.tsx`'s `getMilestoneAnnouncement(290)` returns `null` — the function never saw `300` directly and has no record that the threshold was crossed.

## Related

- Distinct from BUG-271 (no focus management on session-end transition) — both are accessibility gaps on the practice/exam session lifecycle surface but affect different mechanisms (live-region announcement timing vs. DOM focus movement), and this repo grades the two categories differently (P4 vs P3 respectively).
- `docs/_archive/bugs/bug-255-review-submit-screen-stops-exam-timer.md` is the precedent confirming `ExamTimer` genuinely unmounts during Review & Submit — load-bearing evidence for why the fix must live in the hook, not the component.
- Does not affect or regress the already-correct, separately-guarded final expiry announcement and exam finalization.
