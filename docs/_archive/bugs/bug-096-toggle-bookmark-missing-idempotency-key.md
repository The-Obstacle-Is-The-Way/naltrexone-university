# BUG-096: `toggleBookmark` Missing Idempotency Key

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-07

---

## Description

`toggleBookmark` did not support idempotency, so retry behavior could produce inconsistent client expectations.

## Root Cause

Bookmark controller executed toggle directly, with no idempotency key in schema and no `withIdempotency` wrapper.

- `src/adapters/controllers/bookmark-controller.ts` (pre-fix)

## Impact

In retry scenarios, users could observe confusing state changes for a single perceived action.

## Fix

Added idempotency support end-to-end for bookmark toggle:

- Added optional `idempotencyKey` to `ToggleBookmarkInputSchema`
- Added `ToggleBookmarkOutputSchema` replay parser
- Wrapped toggle execution in `withIdempotency`
- Injected idempotency dependencies in container wiring
- Added controller replay test
- Propagated idempotency key through practice-page logic/hook path

Files:

- `src/adapters/controllers/bookmark-controller.ts`
- `src/adapters/controllers/bookmark-controller.test.ts`
- `lib/container/controllers.ts`
- `app/(app)/app/practice/practice-page-logic.ts`
- `app/(app)/app/practice/practice-page-logic.test.ts`
- `app/(app)/app/practice/hooks/use-practice-question-flow.ts`

## Verification

- [x] Action accepts optional idempotency key
- [x] Same-key retry reuses stored output
- [x] Practice flow passes idempotency key to toggle action
- [x] Full regression suite passed (`pnpm typecheck && pnpm lint && pnpm test --run`)

## Related

- `docs/_archive/bugs/bug-091-end-practice-session-missing-idempotency-key.md`
- `docs/_archive/bugs/bug-095-set-question-mark-missing-idempotency-key.md`
- `docs/adr/adr-015-idempotency-strategy.md`
