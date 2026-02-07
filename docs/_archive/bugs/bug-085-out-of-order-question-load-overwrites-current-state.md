# BUG-085: Out-of-Order Question Loads Can Overwrite Current State

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-07

---

## Description

Question-loading requests are not sequenced. If two requests are in flight, an older request can resolve after a newer request and overwrite the newest UI state.

This affects both:
- practice landing flow (`/app/practice`)
- in-session flow (`/app/practice/[sessionId]`)

## Steps to Reproduce

1. Trigger two question loads quickly (for example, rapidly changing filters and retrying; or rapid in-session navigation).
2. Ensure request A starts first but resolves after request B.
3. Observe the UI state after both resolve.

**Observed:** Late response from request A can replace question/session state already set by request B.

**Expected:** Only the latest in-flight request should be allowed to commit state.

## Root Cause

Both loaders immediately commit whichever response arrives, with no request token/version guard:

- `app/(app)/app/practice/practice-page-logic.ts:44-101`
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts:11-73`

## Impact

- Users can see or answer a question that no longer matches their latest navigation/filter intent.
- Session context can be stale (`setSessionInfo` in session flow).
- Hard-to-reproduce correctness issues under normal rapid interaction.

## Fix

Added request sequencing for both question-loading paths:

- `loadNextQuestion` in `app/(app)/app/practice/practice-page-logic.ts`
- `loadNextQuestion` in `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts`

Both loaders now accept optional request-sequencing callbacks and discard any
response that is no longer the latest request when it resolves.

Both calling hooks now provide request IDs from refs:

- `app/(app)/app/practice/hooks/use-practice-question-flow.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`

Regression coverage was added for out-of-order completion in:

- `app/(app)/app/practice/practice-page-logic.test.ts`
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts`

## Verification

- [x] Unit test reproduces out-of-order completion and demonstrates stale overwrite pre-fix
- [x] Unit test confirms stale response is ignored post-fix
- [ ] Manual verification in both `/app/practice` and `/app/practice/[sessionId]`

## Related

- `app/(app)/app/practice/hooks/use-practice-question-flow.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`
