# DEBT-116: Session Page Client God Component (670 Lines)

**Status:** Open
**Priority:** P1
**Date:** 2026-02-06
**Spec Mandate:** [SPEC-020](../specs/spec-020-practice-engine-completion.md) Phase 1

---

## SPEC-020 Reclassification

This debt item has been promoted from discretionary tech debt to a **spec-mandated prerequisite**. SPEC-020 Phase 1 requires decomposing both god components (DEBT-115 and DEBT-116) before any feature work in Phases 2–4 can proceed. The session page must host the question navigator (DEBT-122) and enriched summary (DEBT-123) — adding these to a 670-line monolithic component is untenable.

**Phase:** 1 (Structural Refactoring — PREREQUISITE)
**Blocked by:** None
**Blocks:** SPEC-020 Phases 2, 3, 4

---

## Description

`app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx` is 670 lines with 17 `useState` state variables managing session continuation, question progression, review stage transitions, bookmark management, mark-for-review (exam mode), and session finalization with auto-redirect.

This is the second largest component in the codebase. Like DEBT-115, it's a combined UI + state machine + data orchestrator with a broad prop surface on `PracticeSessionPageView`.

## Impact

- Complex state machine is difficult to reason about — effects interact in non-obvious ways
- The `onEndSession` → review stage → finalize flow has subtle branching (tutor vs exam) buried in a giant component
- Adding question navigation (BUG-072) and session summary (BUG-073) will push this past 1000 lines
- Broad view prop surface indicates excessive prop drilling

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

- [SPEC-020: Practice Engine Completion](../specs/spec-020-practice-engine-completion.md) — Phase 1
- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx` (670 lines)
- DEBT-115 (practice page — same pattern)
- BUG-072 (question navigation — must be added here)
- BUG-073 (session summary — must be added here)
