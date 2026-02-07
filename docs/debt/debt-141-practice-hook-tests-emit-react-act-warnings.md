# DEBT-141: Practice Hook Tests Emit Repeated React `act(...)` Warnings

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The unit test suite passes, but multiple practice hook tests emit repeated React warnings about updates not wrapped in `act(...)`.

Validated from first principles during `pnpm test --run`:

- Warnings appear in:
  - `app/(app)/app/practice/hooks/use-practice-session-controls.test.tsx`
  - `app/(app)/app/practice/hooks/use-practice-session-history.test.tsx`
  - `app/(app)/app/practice/hooks/use-practice-question-flow.test.tsx`
  - `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.test.tsx`
  - `src/application/test-helpers/render-live-hook.test.tsx`

## Impact

- Noisy test output makes real failures harder to detect quickly
- Indicates async state transitions are not fully synchronized in test harnesses
- Lowers confidence in hook-level behavior assertions

## Resolution

1. Update hook test harness utilities to ensure async updates are observed through `act`-safe patterns
2. Refactor affected tests to await state transitions via helper methods that guarantee React update flushing
3. Add a regression check to keep warning-free runs in CI

## Verification

- [ ] `pnpm test --run` completes with zero React `act(...)` warnings from these hook tests
- [ ] Existing hook assertions continue to pass unchanged in intent
- [ ] No new hook warnings are introduced in related test suites

## Related

- `app/(app)/app/practice/hooks/use-practice-session-controls.test.tsx`
- `app/(app)/app/practice/hooks/use-practice-session-history.test.tsx`
- `app/(app)/app/practice/hooks/use-practice-question-flow.test.tsx`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.test.tsx`
- `src/application/test-helpers/render-live-hook.tsx`
- `src/application/test-helpers/render-live-hook.test.tsx`
