# BUG-091: `endPracticeSession` Missing Idempotency Key

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-07

---

## Description

`endPracticeSession` lacked idempotency protection, so network retries could surface avoidable conflict errors after a successful first attempt.

## Root Cause

Controller action executed end-session directly without `withIdempotency`, and the input schema had no `idempotencyKey`.

- `src/adapters/controllers/practice-controller.ts` (pre-fix)

## Impact

Retry after transport failure could produce inconsistent UX (`CONFLICT`) despite already-completed server-side mutation.

## Fix

Wired `endPracticeSession` into the existing ADR-015 idempotency infrastructure:

- Added optional `idempotencyKey` to `EndPracticeSessionInputSchema`
- Added `EndPracticeSessionOutputSchema` for replay parsing
- Wrapped end-session execution in `withIdempotency`
- Added regression test for repeated same-key calls returning stored result
- Propagated idempotency key from session-page logic/review-stage hook

Files:

- `src/adapters/controllers/practice-controller.ts`
- `src/adapters/controllers/practice-controller.test.ts`
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts`
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts`

## Verification

- [x] `endPracticeSession` accepts optional idempotency key
- [x] Duplicate same-key execution replays stored result
- [x] Client flow forwards generated key when ending session
- [x] Full regression suite passed (`pnpm typecheck && pnpm lint && pnpm test --run`)

## Related

- `src/adapters/shared/with-idempotency.ts`
- `docs/adr/adr-015-idempotency-strategy.md`
