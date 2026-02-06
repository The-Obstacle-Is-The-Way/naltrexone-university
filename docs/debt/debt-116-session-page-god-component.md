# DEBT-116: Session Page Client God Component (668 Lines)

**Status:** Open
**Priority:** P1
**Date:** 2026-02-06

---

## Description

`app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx` is 668 lines with 16+ `useState` hooks managing session continuation, question progression, review stage transitions, bookmark management, mark-for-review (exam mode), and session finalization with auto-redirect.

This is the second largest component in the codebase. Like DEBT-115, it's a combined UI + state machine + data orchestrator. The `PracticeSessionPageView` subcomponent receives 17 props.

## Impact

- Complex state machine is difficult to reason about — effects interact in non-obvious ways
- The `onEndSession` → review stage → finalize flow has subtle branching (tutor vs exam) buried in a giant component
- Adding question navigation (BUG-072) and session summary (BUG-073) will push this past 1000 lines
- 17-prop view component indicates excessive prop drilling

## Resolution

### Option A: Extract State Machine + Custom Hooks (Recommended)

1. Extract `useSessionStateMachine()` hook — manages the question → review → summary state transitions
2. Extract `useQuestionProgression()` hook — next question loading, answer submission, mark-for-review
3. Extract `useSessionReview()` hook — review stage data, finalization
4. Extract `useBookmarkManager()` hook — reuse from DEBT-115 if possible
5. Split `PracticeSessionPageView` into composed subcomponents

### Option B: XState or Finite State Machine

The session flow is genuinely a state machine (answering → reviewing → summarizing). Model it explicitly with a state machine library or a discriminated union reducer.

## Verification

- [ ] No single file exceeds 300 lines
- [ ] State machine logic independently testable
- [ ] Prop drilling reduced to <5 props per component
- [ ] Existing test suite passes
- [ ] Session flow behavior unchanged (tutor and exam modes)

## Related

- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx` (668 lines)
- DEBT-115 (practice page — same pattern)
- BUG-072 (question navigation — must be added here)
- BUG-073 (session summary — must be added here)
