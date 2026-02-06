# DEBT-115: Practice Page God Component (823 Lines)

**Status:** Open
**Priority:** P1
**Date:** 2026-02-06
**Spec Mandate:** [SPEC-020](../specs/spec-020-practice-engine-completion.md) Phase 1

---

## SPEC-020 Reclassification

This debt item has been promoted from discretionary tech debt to a **spec-mandated prerequisite**. SPEC-020 Phase 1 requires decomposing both god components (DEBT-115 and DEBT-116) before any feature work in Phases 2–4 can proceed. Navigation (DEBT-122) and enriched summary (DEBT-123) features cannot be cleanly added to an 823-line monolithic component.

**Phase:** 1 (Structural Refactoring — PREREQUISITE)
**Blocked by:** None
**Blocks:** SPEC-020 Phases 2, 3, 4

---

## Description

`app/(app)/app/practice/page.tsx` is 823 lines with 20 `useState` state variables managing question state, filters, tags, bookmarks, session lifecycle, error handling, and session abandonment in a single client component. The `PracticeView` subcomponent also has a broad prop surface.

This is the largest component in the codebase and violates Single Responsibility Principle — it's a UI component, a state machine, a data-fetching orchestrator, and a business logic coordinator rolled into one.

## Impact

- Extremely difficult to test individual behaviors in isolation
- Any change to one concern risks breaking others (e.g., changing bookmark logic affects session state)
- Large `PracticeView` prop surface is a code smell for excessive prop drilling
- New feature work (BUG-072 question navigation, BUG-073 session summary) will make this worse

## Resolution

### Option A: Extract State Machine + Custom Hooks (Recommended)

1. Extract `usePracticeSession()` hook — session lifecycle state machine (start, resume, end, abandon)
2. Extract `useQuestionLoader()` hook — question fetching, loading states, error retry
3. Extract `useBookmarkManager()` hook — bookmark toggle, status, messages
4. Extract `useFilterState()` hook — tag/difficulty filter management
5. `PracticeView` split into composed subcomponents that receive only their relevant props

### Option B: useReducer + Context

Replace 16 `useState` calls with a single `useReducer` + React Context provider. Subcomponents consume context directly (no prop drilling).

## Verification

- [ ] No single file exceeds 300 lines
- [ ] Each extracted hook is independently testable
- [ ] Prop drilling reduced to <5 props per component
- [ ] Existing test suite passes
- [ ] No behavioral regressions in practice flow

## Related

- [SPEC-020: Practice Engine Completion](../specs/spec-020-practice-engine-completion.md) — Phase 1
- `app/(app)/app/practice/page.tsx` (823 lines)
- DEBT-116 (session page client component — same pattern)
- BUG-072 (question navigation — will add more complexity here)
- BUG-073 (session summary — will add more complexity here)
