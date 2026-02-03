# BUG-054: Async State Updates After Component Unmount in Page Logic

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-03
**Resolved:** 2026-02-03

---

## Summary

Several client-side async page-logic helpers awaited controller functions and then unconditionally called React state setters. If the user navigated away (component unmounted) while the async work was in-flight, the helpers could attempt to update state after unmount.

While modern React suppresses the classic “setState on unmounted component” warning, this is still incorrect lifecycle behavior and can cause confusing UI updates in edge cases.

## Root Cause

Async logic helpers (e.g., `loadNextQuestion`, `submitAnswerForQuestion`) had no “mounted” guard after `await`, and catch blocks could also set state after unmount.

## Fix

1. Add an optional `isMounted(): boolean` callback to affected async logic functions.
2. After each awaited call (and inside catch blocks), bail out early when unmounted.
3. Wire a stable `isMounted()` implementation from client pages via a `useRef` that is flipped to `false` on unmount.
4. Add regression tests covering the unmount-before-resolve behavior.

## Verification

- [x] Unit tests added/updated:
  - `app/(app)/app/questions/[slug]/question-page-logic.test.ts`
  - `app/(app)/app/practice/practice-page-logic.test.ts`
  - `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts`
- [x] Manual: navigate away mid-load/submit and confirm no late UI updates occur

## Related

- BUG-032: State Update After Component Unmount (bookmark effect)

