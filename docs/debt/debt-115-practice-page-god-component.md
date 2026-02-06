# DEBT-115: Practice Page God Component (823 Lines)

**Status:** Open
**Priority:** P1
**Date:** 2026-02-06

---

## Description

`app/(app)/app/practice/page.tsx` is 823 lines with 21 `useState` state variables managing question state, filters, tags, bookmarks, session lifecycle, error handling, and session abandonment in a single client component. The `PracticeView` subcomponent also has a broad prop surface.

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

- `app/(app)/app/practice/page.tsx` (823 lines)
- DEBT-116 (session page client component — same pattern)
- BUG-072 (question navigation — will add more complexity here)
- BUG-073 (session summary — will add more complexity here)
