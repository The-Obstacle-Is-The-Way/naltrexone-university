# BUG-139: GetPreviousAttemptUseCase Silently Returns Null on Data Integrity Mismatch

**Status:** Open
**Priority:** P3
**Date:** 2026-02-16

---

## Description

When `GetPreviousAttemptUseCase` fetches an attempt by ID and the attempt's `questionId` doesn't match `input.questionId`, it logs a warning and returns `null`. Callers cannot distinguish between "no attempt exists" and "data integrity mismatch." The mismatch scenario is reachable because `findByIdAndUserId()` does not filter by `questionId`.

**Observed:** Mismatched `attemptId <> questionId` pairs produce a warning log and return `null` — identical to "no previous attempt."

**Expected:** A mismatch should either throw an `ApplicationError` or be explicitly documented as intentional behavior.

## Evidence: Full Vertical Trace

### 1. The Bug — `src/application/use-cases/get-previous-attempt.ts:35-59`

```typescript
const attempt = input.attemptId
  ? await this.attempts.findByIdAndUserId(input.attemptId, input.userId)  // ← No questionId filter
  : input.sessionId
    ? await this.attempts.findBySessionIdAndQuestionId(...)                // ← Has questionId filter
    : await this.attempts.findLatestByUserAndQuestion(...);                // ← Has questionId filter

if (!attempt) return null;

if (attempt.questionId !== input.questionId) {                            // Line 49: Mismatch detected
  this.logger.warn(                                                       // Line 50: Warning only
    { attemptId: input.attemptId, questionId: input.questionId, attemptQuestionId: attempt.questionId },
    'Previous attempt does not match requested question',
  );
  return null;                                                            // Line 58: Silent null
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
    .where(and(
      eq(attempts.id, attemptId),
      eq(attempts.userId, userId),       // ← Only filters by attemptId + userId
    ))                                    // ← NO questionId filter
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

### 4. Controller Passes Through Silently — `src/adapters/controllers/question-view-controller.ts:94-106`

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

Returns `GetPreviousAttemptOutput | null`. The controller does not distinguish between `null` from "not found" vs `null` from "data mismatch."

### 5. UI Treats Null as "No Previous Attempt" — `app/(app)/app/questions/[slug]/question-page-logic.ts:229-248`

```typescript
let res: ActionResult<GetPreviousAttemptOutput | null>;   // Line 229
try {
  res = await withTimeout(
    input.getPreviousAttemptFn({...}),
    PREVIOUS_ATTEMPT_TIMEOUT_MS,
  );
} catch {
  return;                           // ← Silently falls back to attempt mode
}

if (!res.ok || !res.data) {         // Line 245
  return;                           // ← Null treated as "no attempt" — shows attempt mode
}
```

When `null` is returned (from either "not found" or "data mismatch"), the UI shows **attempt mode** (blank choice selection + submit button) instead of **review mode** (showing the previous answer). The user has no indication that something went wrong.

### 6. Test Confirms the Behavior — `src/application/use-cases/get-previous-attempt.test.ts:114-172`

The test suite has a single test covering the mismatch scenario with two assertions, confirming the silent-null behavior is intentional but undocumented:

- Assertion 1 (line 160): verifies that `null` is returned when `attemptId` references a different question
- Assertion 2 (lines 162-171): verifies that a warning is logged with correct context

### 7. Summary: The Indistinguishability Problem

| Scenario | Use Case Returns | UI Behavior | User Experience |
|----------|-----------------|-------------|-----------------|
| No attempt exists | `null` | Attempt mode | Correct |
| Attempt exists, wrong question | `null` | Attempt mode | **Misleading — user expected review** |
| Network error / timeout | Exception → `null` | Attempt mode | Acceptable fallback |

All three produce identical UI behavior, but only one indicates a potential data integrity problem.

## Root Cause

Design choice: the use case was written to be resilient against bad `attemptId` inputs, treating them as "not found" rather than errors. This makes sense for UX (don't crash on bad URLs) but sacrifices observability (can't detect data integrity issues through structured error codes).

## Fix

**Option A — Escalate to error (preferred for data integrity):**

```typescript
if (attempt.questionId !== input.questionId) {
  this.logger.error(
    { attemptId: input.attemptId, questionId: input.questionId, attemptQuestionId: attempt.questionId },
    'Previous attempt does not match requested question — possible data corruption',
  );
  throw new ApplicationError(
    'INTERNAL_ERROR',
    'Attempt does not belong to the requested question',
  );
}
```

**Option B — Keep soft-fail but document explicitly:**

Add an inline comment explaining why the silent null is intentional (e.g., "Treat cross-question attempt lookups as not-found for graceful URL handling"):

```typescript
// INTENTIONAL: Return null (not error) for cross-question attemptId lookups.
// Users may reach this via stale URLs or browser history. Showing attempt-mode
// (fresh answer) is the correct UX degradation. The logger.warn provides
// observability for monitoring dashboards.
```

## Verification

- [ ] Unit test: `it('throws INTERNAL_ERROR when attempt questionId mismatches input questionId')` (Option A)
- [ ] OR: Add inline comment documenting intentional soft-fail (Option B)
- [ ] Review `loadPreviousAttempt` in `question-page-logic.ts` to handle new error gracefully

## Related

- `src/application/use-cases/get-previous-attempt.ts:35-59` — Bug location
- `src/adapters/repositories/drizzle-attempt-repository.ts:205-216` — Repository without `questionId` filter
- `src/adapters/controllers/question-view-controller.ts:94-106` — Controller pass-through
- `app/(app)/app/questions/[slug]/question-page-logic.ts:229-248` — UI silent fallback
- `src/application/use-cases/get-previous-attempt.test.ts:114-172` — Existing mismatch tests
