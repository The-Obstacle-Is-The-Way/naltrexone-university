# BUG-091: `endPracticeSession` Missing Idempotency Key

**Status:** Open
**Priority:** P3
**Date:** 2026-02-07

---

## Description

The `endPracticeSession` server action does not support an idempotency key, unlike `startPracticeSession` and `submitAnswer` which both use the `withIdempotency` wrapper. If a user's network drops after the server processes the end-session request but before the client receives the response, a retry yields a `CONFLICT` error instead of an idempotent success.

## Steps to Reproduce

1. Start a practice session and answer some questions
2. Click "End Session"
3. Simulate network failure after server processes the request but before client receives response
4. Client retries the "End Session" request
5. Server returns `CONFLICT: Practice session already ended` instead of 200

## Root Cause

`src/adapters/controllers/practice-controller.ts:217-227` — `endPracticeSession` calls the use case directly without an idempotency key wrapper:

```typescript
export const endPracticeSession = createAction({
  schema: EndPracticeSessionInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.endPracticeSessionUseCase.execute({
      userId,
      sessionId: input.sessionId,
    });
  },
});
```

Contrast with `startPracticeSession` (line 160-203) which wraps execution in `withIdempotency()`.

The repository layer at `drizzle-practice-session-repository.ts` throws `CONFLICT` when `endedAt` is already set, which is correct behavior but not client-friendly on retries.

## Impact

- User sees an error message after successfully ending their session
- The session IS correctly ended — this is a UX issue, not data corruption
- Workaround: refresh the page (session summary will load correctly)

## Proposed Fix

Either:
1. Add `idempotencyKey` to `EndPracticeSessionInputSchema` and wrap with `withIdempotency`, or
2. Make the end-session operation idempotent at the repository level — return the existing `EndPracticeSessionOutput` if the session is already ended instead of throwing `CONFLICT`

Option 2 is simpler and doesn't require schema changes.

## Verification

- [ ] Calling `endPracticeSession` twice with the same `sessionId` returns success both times
- [ ] Session summary data is identical on both calls
- [ ] Existing tests for end-session still pass

## Related

- `src/adapters/controllers/practice-controller.ts` (startPracticeSession has idempotency)
- `src/adapters/shared/with-idempotency.ts`
- `src/adapters/repositories/drizzle-practice-session-repository.ts` (end method)
