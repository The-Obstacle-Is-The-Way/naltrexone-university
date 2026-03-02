# Bug Audit #8 — Deep Codebase Sweep

**Date:** 2026-03-01
**Scope:** Full codebase (`src/`, `app/`, `components/`) — 516 TypeScript/TSX files
**Method:** Automated pattern search + manual code review

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **P0** | 0 | No data-loss or critical security bugs found |
| **P1** | 0 | No major functionality broken |
| **P2** | 5 | Significant bugs with workarounds or low-probability triggers |
| **P3** | 5 | Minor / edge-case bugs |
| **P4** | 2 | Trivial / cosmetic |

**Overall:** The codebase is well-engineered. No SQL injection, no missing auth checks, no unvalidated env vars, no `as any` in production code, no empty catch blocks. The issues found are race conditions, edge-case logic errors, and defensive-code gaps.

---

## P2 — Significant (workaround exists or low-probability trigger)

### BUG-167: `loadPreviousAttempt` catch block sets state without `isMounted()` guard

**File:** `app/(app)/app/questions/[slug]/question-page-logic.ts:342-344`

```ts
} catch {
  setReviewHydrationState('hydration_error'); // no isMounted() check
  return;
}
if (!isMounted()) return;  // guard is AFTER the catch, not inside it
```

**Problem:** Every other async path in this file checks `isMounted()` after await before touching state. The catch block skips it. If the component unmounts during the `withTimeout` call (user navigates away quickly), this sets state on an unmounted component.

**Impact:** React warning in dev, potential stale render in prod. The fast-navigation case is real.

**Fix:**
```ts
} catch {
  if (!isMounted()) return;
  setReviewHydrationState('hydration_error');
  return;
}
```

---

### BUG-168: `GetNextQuestionUseCase` skips current question in both forward and wrap scans

**File:** `src/application/use-cases/get-next-question.ts:162-174`

```ts
const nextUnanswered =
  orderedStates
    .slice(startIndex + 1)         // forward: current+1 → end
    .find(...)?.questionId ?? null;

if (nextUnanswered) return nextUnanswered;
if (startIndex === -1) return null;

return (
  orderedStates
    .slice(0, startIndex)           // wrap: 0 → current-1 (EXCLUSIVE of current)
    .find(...)?.questionId ?? null
);
```

**Problem:** When `fromIndex` is provided, the current question at `startIndex` is excluded from BOTH scans. If the current question is the only unanswered one, the function returns `null` (session complete), even though the user hasn't answered it yet.

**Impact:** User gets sent to the summary screen while viewing an unanswered question. Requires: user navigates to the last unanswered question when all others are answered.

**Fix:** After both scans return null, check the current question itself:
```ts
// Last resort: is the current question itself unanswered?
const current = orderedStates[startIndex];
if (current && !current.latestSelectedChoiceId) return current.questionId;
return null;
```

---

### BUG-169: Idempotency poll loop `break` falls into misleading CONFLICT error

**File:** `src/adapters/shared/with-idempotency.ts:99-137`

```ts
while (input.now().getTime() - startMs <= maxWaitMs) {
  const existing = await input.repo.find(...);
  if (!existing) {
    break;   // key disappeared — falls through to...
  }
  // ...
  await delay(pollIntervalMs);
}

throw new ApplicationError(
  'CONFLICT',
  'Request timed out waiting for idempotency key...',
);
```

**Problem:** When the polling loop finds the key no longer exists (`!existing`), it `break`s out and hits the `throw` at line 134. The error says "timed out" but the actual state is "key disappeared." The correct behavior would be to re-execute the operation rather than fail with CONFLICT.

**Impact:** Misleading error classification. User sees CONFLICT when the concurrent operation may have succeeded and cleaned up.

**Fix:** After `break`, re-attempt to `claim` and execute (the key is gone, so `claim` should succeed), or throw a more specific `INTERNAL_ERROR` explaining the key disappeared.

---

### BUG-170: Non-atomic COUNT + SELECT in `findCompletedByUserId` pagination

**File:** `src/adapters/repositories/drizzle-practice-session-repository.ts:106-138`

```ts
const [countRow] = await this.db
  .select({ count: sql<number>`count(*)::int` })    // Query 1
  .from(practiceSessions)
  .where(this.completedSessionCondition(userId, mode));

// ... separate query ...

const rows = await this.db.query.practiceSessions.findMany({  // Query 2
  where: this.completedSessionCondition(userId, mode),
  limit: safeLimit,
  offset: safeOffset,
});
```

**Problem:** Two separate queries with no wrapping transaction. Between them, new sessions could be completed or the count could change. `total` can be stale relative to `rows`.

**Impact:** Pagination shows wrong total (e.g. "Page 1 of 3" but last page has fewer rows than expected). Low probability with single-user traffic, higher under concurrent session completions.

**Fix:** Wrap both queries in a single transaction, or use `COUNT(*) OVER()` as a window function in a single query.

---

### BUG-171: Stripe checkout `retrieve` failure silently skips session expiry

**File:** `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:147-164`

```ts
} catch (error) {
  logger.warn({ sessionId: existingSession.id, error }, 'Failed to inspect...');
  // falls through with existingPriceId = undefined
}

if (existingPriceId === priceId) {    // false when undefined
  return { url: existingUrl };
}

if (existingPriceId) {                // false when undefined — skips expire!
  await callStripe({ fn: () => stripe.checkout.sessions.expire(...) });
}
```

**Problem:** When `retrieve` fails, `existingPriceId` remains `undefined`. The code skips the re-use check (correct) but ALSO skips the expire-and-recreate path. It falls through to create a new session while the old one remains open. Stale open checkout sessions can accumulate.

**Impact:** Multiple open Stripe checkout sessions for the same user. Low probability (requires Stripe API flakiness) but causes billing confusion if the user finds an old checkout URL.

**Fix:** After the catch block, if `existingPriceId === undefined`, either still attempt to expire the old session (best-effort), or treat the failure as "unknown state" and create a fresh session after attempting expire.

---

## P3 — Minor / Edge Cases

### BUG-172: `storeError` failure masks original execute error in idempotency handler

**File:** `src/adapters/shared/with-idempotency.ts:88-96`

```ts
} catch (error) {
  await input.repo.storeError({ ... });  // if THIS throws...
  throw error;                            // ...this line never runs
}
```

**Problem:** If `storeError()` throws (e.g. the idempotency key was pruned between execute failure and storeError call), the original business error is swallowed and replaced by the storeError exception.

**Impact:** Wrong error reaches the caller. Makes debugging harder. Very unlikely (key TTL is 24 hours).

**Fix:**
```ts
} catch (error) {
  try {
    await input.repo.storeError({ ... });
  } catch (storeErr) {
    logger.error({ storeErr, originalError: error }, 'Failed to store idempotency error');
  }
  throw error;
}
```

---

### BUG-173: `get-session-history` adjusts `total` by `skippedCount` incorrectly

**File:** `src/application/use-cases/get-session-history.ts:102`

```ts
const total = Math.max(0, page.total - skippedCount);
```

**Problem:** `page.total` is the DB-wide COUNT of completed sessions. `skippedCount` is from the current page's rows. Subtracting page-local skips from the global count is mathematically wrong — the same skipped rows might not appear on other pages. In practice, `skippedCount` is always 0 (the DB query filters `endedAt IS NOT NULL`), so this code path is dead — but it's wrong if it ever fires.

**Fix:** Remove the `skippedCount` adjustment. If a row with null `endedAt` appears, log an `INTERNAL_ERROR` instead of silently skipping it.

---

### BUG-174: `checkout-success-sync` guards `logger.warn` as if it's optional

**File:** `app/(marketing)/checkout/success/checkout-success-sync.tsx:54-59`

```ts
if (logger.warn) {
  logger.warn(logContext, 'Retrying Stripe API call');
  return;
}
logger.error(logContext, 'Retrying Stripe API call');
```

**Problem:** The `Logger` interface requires `warn` — it's not optional. The guard always passes. The dead `logger.error` fallback logs retries at error severity, which is semantically wrong.

**Fix:** Remove the `if (logger.warn)` guard and call `logger.warn` directly.

---

### BUG-175: `DrizzleRateLimiter.limit` defaults count to 1 on missing row

**File:** `src/adapters/gateways/drizzle-rate-limiter.ts:66`

```ts
const count = row?.count ?? 1;
```

**Problem:** The `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` always returns a row in Postgres. The `?? 1` fallback implies the author anticipated `row` being undefined. If it somehow were (Drizzle bug, DB proxy quirk), defaulting to 1 would let the first request of every window bypass rate limiting.

**Fix:** Throw `INTERNAL_ERROR` if `row` is undefined instead of defaulting to 1.

---

### BUG-176: `findBySessionId` has no LIMIT clause

**File:** `src/adapters/repositories/drizzle-attempt-repository.ts:231-241`

```ts
async findBySessionId(sessionId: string, userId: string) {
  const rows = await this.db.query.attempts.findMany({
    where: and(
      eq(attempts.practiceSessionId, sessionId),
      eq(attempts.userId, userId),
    ),
    orderBy: desc(attempts.answeredAt),
    // No limit!
  });
```

**Problem:** Fetches all attempts for a session unboundedly. Sessions have a max question count, but retry attempts (`retryOfAttemptId`) are stored as separate rows and accumulate without dedup.

**Impact:** Query slows down as retries accumulate per session. Not immediately problematic with current session sizes (~20 questions) but scales poorly.

**Fix:** Add `limit: 500` as a safety cap, or document the intentional unbounded read.

---

## P4 — Trivial

### BUG-177: `getStemPreview` returns raw truncation when `maxLength <= 3`

**File:** `src/adapters/shared/stem-preview.ts:27`

```ts
if (maxLength <= 3) return plain.slice(0, Math.max(0, maxLength));
```

**Problem:** Returns a raw character slice with no ellipsis. `getStemPreview("The patient presents with...", 3)` returns `"The"` with no truncation indicator. Very unlikely to be called with `maxLength <= 3` in practice.

**Fix:** Document that `maxLength <= 3` is unsupported, or return `"..."` when `maxLength === 3`.

---

### BUG-178: TOCTOU pre-check in `start-practice-session` is redundant

**File:** `src/application/use-cases/start-practice-session.ts:42-50`

**Problem:** The application-level check for incomplete sessions is a courtesy — the DB unique constraint (`PRACTICE_SESSIONS_USER_INCOMPLETE_UQ`) is the real guard. The pre-check wastes a DB round-trip when a concurrent request already created the session.

**Impact:** None. The DB constraint correctly prevents dual-session creation. The pre-check is harmless fast-path logic.

**Fix:** Optional — add a comment documenting this as an intentional fast-path.

---

## What Was NOT Found (Clean Areas)

| Area | Status |
|------|--------|
| **SQL Injection** | All queries use Drizzle's parameterized API |
| **Auth/AuthZ gaps** | All app routes gated by `requireEntitledUserId`; webhooks verify signatures |
| **Env var validation** | `lib/env.ts` has thorough Zod validation for all env vars |
| **`as any` in production** | Zero occurrences — all type assertions are in test files |
| **Empty catch blocks** | None — all catches either re-throw, convert to `ApplicationError`, or log with documented rationale |
| **Unhandled promises** | All `void` async calls go through `fireAndForget()` with `.catch()` |
| **Secret leakage** | No secrets in response payloads or client code |
| **Missing loading states** | Covered by `Suspense` boundaries and skeleton components |
| **useEffect dep arrays** | 2 intentional `biome-ignore` suppressions, both documented |

---

## Recommended Fix Order

1. **BUG-168** (P2) — `GetNextQuestionUseCase` skips current question. Highest impact: user sent to summary while viewing unanswered question.
2. **BUG-167** (P2) — Missing `isMounted()` guard. One-line fix, prevents React warnings and stale state.
3. **BUG-169** (P2) — Idempotency poll loop error. Wrong error classification confuses debugging.
4. **BUG-172** (P3) — `storeError` masking. Simple try/catch wrapper prevents error swallowing.
5. **BUG-174** (P3) — Dead `logger.warn` guard. One-line deletion.
6. **BUG-170** (P2) — Non-atomic pagination. Requires transaction wrapping or window function.
7. **BUG-171** (P2) — Stripe checkout stale sessions. Requires careful Stripe API flow changes.
8. **BUG-173** (P3) — Session history total adjustment. Remove dead code path.
9. **BUG-175** (P3) — Rate limiter fallback. Change `?? 1` to throw.
10. **BUG-176** (P3) — Unbounded `findBySessionId`. Add safety cap.
11. **BUG-177** (P4) — Stem preview edge case.
12. **BUG-178** (P4) — Redundant pre-check (document only).
