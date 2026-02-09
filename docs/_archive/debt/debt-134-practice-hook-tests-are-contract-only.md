# DEBT-134: Practice Hook Tests Are Contract-Only (Behavior Gaps)

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-07

---

## Description

The six practice-hook test files added during SPEC-020 currently assert only initial shape/function presence. They do not verify async state transitions, error paths, or race handling.

## Impact

- High-risk hook regressions can pass CI undetected.
- Newly identified race/error bugs in practice hooks are not caught by current tests.
- Creates false confidence in "covered" hook layer.

## Evidence

All hook tests currently follow the same "initial state contract" pattern:

- `app/(app)/app/practice/hooks/use-practice-question-flow.test.tsx`
- `app/(app)/app/practice/hooks/use-practice-session-controls.test.tsx`
- `app/(app)/app/practice/hooks/use-practice-session-history.test.tsx`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.test.tsx`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.test.tsx`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.test.tsx`

Example pattern:
- `it('returns the expected initial state contract', ...)`
- `expect(typeof output.onX).toBe('function')`

No tests currently force overlapping async completions, thrown server-action failures, or state transition sequences.

## Resolution

Kept the jsdom `*.test.tsx` suites as synchronous “contract” tests (initial return-shape and non-async helpers), using `renderHook` (`src/application/test-helpers/render-hook.tsx`).

Migrated async behavior/race coverage into Browser Mode (`vitest-browser-react`) suites so real state transitions are validated without React 19 `act()` issues:

- `app/(app)/app/practice/hooks/use-practice-question-flow.browser.spec.tsx`
- `app/(app)/app/practice/hooks/use-practice-session-controls.browser.spec.tsx`
- `app/(app)/app/practice/hooks/use-practice-session-history.browser.spec.tsx`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.browser.spec.tsx`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.browser.spec.tsx`

Covered behaviors include:

1. Out-of-order response handling (latest request wins)
2. Thrown server-action failures and error-state transitions
3. Success-path transitions across idle/loading/ready/error states
4. Session-history drill-down race handling

## Verification

- [x] Each hook has at least one success-path async transition test
- [x] Each hook has at least one thrown-error test
- [x] Race-sensitive hooks have out-of-order resolution tests
- [x] Tests fail before fix and pass after fix

## Related

- `docs/_archive/bugs/bug-085-out-of-order-question-load-overwrites-current-state.md`
- `docs/_archive/bugs/bug-086-session-history-drilldown-race-overwrites-selected-session.md`
- `docs/_archive/bugs/bug-087-practice-tag-load-throw-stalls-page.md`
