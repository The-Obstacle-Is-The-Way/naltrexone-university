# BUG-095: `setPracticeSessionQuestionMark` Missing Idempotency Key

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-07

---

## Description

`setPracticeSessionQuestionMark` lacked idempotency key support and replay protection.

## Root Cause

Controller action ran directly without `withIdempotency` and input schema lacked `idempotencyKey`.

- `src/adapters/controllers/practice-controller.ts` (pre-fix)

## Impact

Duplicate retries could still hit avoidable conflict/error conditions under adverse network timing.

## Fix

Aligned mark-for-review mutation with ADR-015 pattern:

- Added optional `idempotencyKey` to `SetPracticeSessionQuestionMarkInputSchema`
- Added `SetPracticeSessionQuestionMarkOutputSchema`
- Wrapped action execution in `withIdempotency`
- Added controller idempotency replay test
- Added hook behavior test that forwards idempotency key

Files:

- `src/adapters/controllers/practice-controller.ts`
- `src/adapters/controllers/practice-controller.test.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.test.tsx`

## Verification

- [x] Action accepts optional idempotency key
- [x] Same-key retries replay persisted result
- [x] Session hook sends generated idempotency key
- [x] Full regression suite passed (`pnpm typecheck && pnpm lint && pnpm test --run`)

## Related

- `docs/_archive/bugs/bug-091-end-practice-session-missing-idempotency-key.md`
- `docs/adr/adr-015-idempotency-strategy.md`
