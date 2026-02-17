# BUG-139: GetPreviousAttemptUseCase Silently Returns Null on Data Integrity Mismatch

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-16
**Resolved:** 2026-02-17
**Component:** Application — GetPreviousAttemptUseCase

---

## Description

Prior to 2026-02-17, when `GetPreviousAttemptUseCase` fetched an attempt by ID and the attempt's `questionId` didn't match `input.questionId`, it logged a warning and returned `null`. Callers could not distinguish between "no attempt exists" and "data integrity mismatch." The mismatch scenario is reachable because `findByIdAndUserId()` does not filter by `questionId`.

**Observed (pre-fix):** Mismatched `attemptId <> questionId` pairs produced a warning log and returned `null` — identical to "no previous attempt."

**Expected:** A mismatch should throw an `ApplicationError` so callers can distinguish it from "no attempt exists."

**Now (fixed):** The use case logs and throws `ApplicationError('NOT_FOUND', …)` on mismatch. The UI still falls back to attempt mode (review is best-effort), but the mismatch is now distinguishable via the action error code.

## Evidence: Full Vertical Trace

### 1. The Fix (Current) — `src/application/use-cases/get-previous-attempt.ts:37-64`

```typescript
    const attempt = input.attemptId
      ? await this.attempts.findByIdAndUserId(input.attemptId, input.userId)
      : input.sessionId
        ? await this.attempts.findBySessionIdAndQuestionId(
            input.sessionId,
            input.userId,
            input.questionId,
          )
        : await this.attempts.findLatestByUserAndQuestion(
            input.userId,
            input.questionId,
          );

    if (!attempt) return null;
    if (attempt.questionId !== input.questionId) {
      this.logger.warn(
        {
          attemptId: input.attemptId,
          questionId: input.questionId,
          attemptQuestionId: attempt.questionId,
        },
        'Previous attempt does not match requested question',
      );
      throw new ApplicationError(
        'NOT_FOUND',
        'Previous attempt does not belong to the requested question',
      );
    }
```

The first branch (`findByIdAndUserId`) is the only one that can produce a mismatch, because the other two branches include `questionId` in their queries.

### 2. Repository Confirms the Gap — `src/adapters/repositories/drizzle-attempt-repository.ts:205-216`

```typescript
  async findByIdAndUserId(
    attemptId: string,
    userId: string,
  ): Promise<Attempt | null> {
    const [row] = await this.db
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
      .limit(1);

    return row ? toAttemptDomain(row) : null;
  }
```

**Contrast with the safe methods:**

- `findBySessionIdAndQuestionId()` (lines 218-236): Filters by `sessionId`, `userId`, **AND `questionId`** — mismatch impossible
- `findLatestByUserAndQuestion()` (lines 187-203): Filters by `userId` **AND `questionId`** — mismatch impossible

### 3. The Mismatch Scenario IS Reachable

A user visits `/app/questions/[slug]?attemptId=<attemptId>` where the `attemptId` belongs to a different question than `[slug]`. This could happen via:

- Stale browser history / bookmarks
- Copy-pasted URLs with wrong parameters
- Client-side state bugs that pair the wrong `attemptId` with a `questionId`

### 4. Controller Passes Through (createAction maps errors) — `src/adapters/controllers/question-view-controller.ts:94-106`

```typescript
export const getPreviousAttempt = createAction({
  schema: GetPreviousAttemptInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.getPreviousAttemptUseCase.execute({
      userId,
      questionId: input.questionId,
      ...(input.attemptId ? { attemptId: input.attemptId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    });
  },
});
```

Returns `GetPreviousAttemptOutput | null` on success. If the use case throws an `ApplicationError` (e.g., `code: 'NOT_FOUND'`), `createAction` catches it and returns `{ ok: false, error: { code, message, … } }`, making the mismatch distinguishable from `{ ok: true, data: null }`.

### 5. UI Treats Null/Error as "No Previous Attempt" — `app/(app)/app/questions/[slug]/question-page-logic.ts:229-248`

```typescript
  let res: ActionResult<GetPreviousAttemptOutput | null>;
  try {
    res = await withTimeout(
      input.getPreviousAttemptFn({
        questionId: input.questionId,
        ...(input.attemptId ? { attemptId: input.attemptId } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      }),
      PREVIOUS_ATTEMPT_TIMEOUT_MS,
    );
  } catch {
    // Silently fall back to attempt mode — review is best-effort
    return;
  }
  if (!isMounted()) return;

  if (!res.ok || !res.data) {
    // No previous attempt or error — stay in attempt mode
    return;
  }
```

When a mismatch occurs, the controller returns `{ ok: false, error: { code: 'NOT_FOUND', … } }` and the UI falls back to **attempt mode** (blank choice selection + submit button) instead of **review mode** (showing the previous answer). The user has no indication that something went wrong (intentional best-effort UX), but the mismatch is now observable as a structured error code.

### 6. Test Confirms the Behavior — `src/application/use-cases/get-previous-attempt.test.ts:114-172`

The test suite has a regression test covering the mismatch scenario with two assertions:

- Assertion 1 (lines 160-161): verifies that `ApplicationError` is thrown with `code: 'NOT_FOUND'`
- Assertion 2 (lines 163-172): verifies that a warning is logged with correct context

### 7. Summary: The Indistinguishability Problem

| Scenario | Use Case Returns | UI Behavior | Observability |
|----------|-----------------|-------------|---------------|
| No attempt exists | `null` | Attempt mode | Normal (no error code) |
| Attempt exists, wrong question | `ApplicationError('NOT_FOUND')` | Attempt mode | **Distinguishable** (`NOT_FOUND`) |
| Network error / timeout | Exception → `null` | Attempt mode | Acceptable fallback (no action result) |

All three still produce identical UI behavior, but mismatches are now distinguishable from "no attempt" through structured error codes and logs.

## Root Cause

Design choice: the use case was written to be resilient against bad `attemptId` inputs, treating them as "not found" rather than errors. This makes sense for UX (don't crash on bad URLs) but sacrifices observability (can't detect data integrity issues through structured error codes).

## Fix

Throw `NOT_FOUND` when `attemptId` does not belong to the requested `questionId` (while still logging for observability):

```typescript
if (attempt.questionId !== input.questionId) {
  this.logger.warn(
    {
      attemptId: input.attemptId,
      questionId: input.questionId,
      attemptQuestionId: attempt.questionId,
    },
    'Previous attempt does not match requested question',
  );
  throw new ApplicationError(
    'NOT_FOUND',
    'Previous attempt does not belong to the requested question',
  );
}
```

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --run`
- Unit test updated in `src/application/use-cases/get-previous-attempt.test.ts`

## Related

- `src/application/use-cases/get-previous-attempt.ts:37-64` — Mismatch guard (fixed)
- `src/adapters/repositories/drizzle-attempt-repository.ts:205-216` — Repository without `questionId` filter
- `src/adapters/controllers/question-view-controller.ts:94-106` — Controller pass-through
- `app/(app)/app/questions/[slug]/question-page-logic.ts:229-248` — UI silent fallback
- `src/application/use-cases/get-previous-attempt.test.ts:114-172` — Mismatch regression test
