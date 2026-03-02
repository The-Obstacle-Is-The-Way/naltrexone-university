# Bug Audit #8 — Deep Codebase Sweep (Verified)

**Date:** 2026-03-01
**Re-verified:** 2026-03-02
**Scope:** Full codebase (`src/`, `app/`, `components/`) — 516 TypeScript/TSX files
**Method:** Automated pattern search + manual code review + vertical/horizontal tracer bullets
**Verification:** Every active bug confirmed with line-by-line code tracing. 3 false positives removed from initial/re-verification drafts.

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **P0** | 0 | No data-loss or critical security bugs found |
| **P1** | 0 | No major functionality broken |
| **P2** | 2 | Significant bugs — real user-facing impact |
| **P3** | 8 | Minor — edge cases, low probability, or cosmetic |
| **P4** | 2 | Trivial — code smells, defensive coding gaps |

**Overall:** The codebase is well-engineered. No SQL injection, no missing auth checks, no unvalidated env vars, no `as any` in production code, no empty catch blocks. The issues found are race conditions, edge-case logic errors, and defensive-code gaps.

---

## Re-Verification Tracer Bullets (2026-03-02)

- **Vertical trace (BUG-168 confirmed):** `practice-view.tsx` "Next" button (always available before submit in tutor mode) → `use-practice-session-question-flow.ts` `onNextQuestion()` computes `fromIndex` from current session index → `practice-session-page-logic.ts` forwards `{ fromIndex }` → `question-controller.ts` forwards `{ fromIndex }` to use case → `get-next-question.ts` excludes current index in both forward and wrap scans.
- **Horizontal trace (BUG-174 disproven):** `checkout-success-sync.tsx` guards `logger.warn` → `checkout-success-types.ts` defines `warn?` as optional by design → `checkout-success/page.test.ts` has explicit no-`warn` scenario (`logger: { info, error }`) validating the fallback `logger.error` path.
- **Horizontal trace (BUG-177 risk refined):** all three prune paths are two-step SELECT+DELETE; `drizzle-idempotency-key-repository` includes `expiresAt < cutoff` in DELETE conditions (race mitigation validated by repository test), while stripe-events prune deletes by ID only (highest race exposure of the three).

---

## P2 — Significant (real user-facing impact)

### BUG-167: `loadPreviousAttempt` catch block sets state without `isMounted()` guard

**File:** `app/(app)/app/questions/[slug]/question-page-logic.ts:342-344`
**Verified:** Every other async path in this file (`loadQuestion` line 128, `submitSelectedAnswer` line 239) checks `isMounted()` inside the catch. This is the only one that doesn't.

```ts
} catch {
  setReviewHydrationState('hydration_error'); // no isMounted() check
  return;
}
if (!isMounted()) return;  // guard is AFTER the catch, not inside it
```

**Problem:** If the component unmounts during the `withTimeout` call (user navigates away quickly), this sets state on an unmounted component.

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
**Verified:** (1) The "Next" button in `practice-view.tsx:297-309` is always enabled — no `submitResult` guard in the `disabled` condition. (2) In tutor mode, users CAN click "Next" before answering. (3) No existing test covers this edge case.

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

**Problem:** When `fromIndex` is provided, the current question at `startIndex` is excluded from BOTH scans. If the current question is the only unanswered one, the function returns `null` (session appears complete).

**Reproduction scenario:**
1. Tutor mode session with 5 questions
2. User answers Q0, Q1, Q3, Q4 (skips Q2)
3. User navigates to Q2 via session navigator
4. User clicks "Next" without answering Q2
5. `onNextQuestion` fires with `fromIndex = 2`
6. Forward scan (Q3, Q4) — both answered → null
7. Backward scan (Q0, Q1) — both answered → null
8. Returns null → session appears complete. Q2 is unanswered.

**Fix:** After both scans return null, check the current question itself:
```ts
// Last resort: is the current question itself unanswered?
const current = orderedStates[startIndex];
if (current && !current.latestSelectedChoiceId) return current.questionId;
return null;
```

---

## P3 — Minor (edge cases, low probability, or cosmetic)

### BUG-169: Idempotency poll loop `break` falls into misleading CONFLICT error

**File:** `src/adapters/shared/with-idempotency.ts:99-137`
**Verified:** Structurally confirmed — `break` at line 107 falls through to `throw CONFLICT` at line 134. Practically near-unreachable: key TTL is 24 hours, poll window is 2 seconds. The key would need to be pruned in that 2-second window, which requires it to have expired (impossible — just claimed).

```ts
while (input.now().getTime() - startMs <= maxWaitMs) {
  const existing = await input.repo.find(...);
  if (!existing) {
    break;   // key disappeared — falls through to throw CONFLICT
  }
  // ...
  await delay(pollIntervalMs);
}

throw new ApplicationError(
  'CONFLICT',
  'Request timed out waiting for idempotency key...',
);
```

**Problem:** When the key disappears mid-poll, the error says "timed out" but the actual state is "key disappeared." Wrong error classification.

**Fix:** After `break`, re-attempt to `claim` and execute, or throw `INTERNAL_ERROR` ("Idempotency key disappeared during poll").

---

### BUG-170: Non-atomic COUNT + SELECT in `findCompletedByUserId` pagination

**File:** `src/adapters/repositories/drizzle-practice-session-repository.ts:106-127`
**Verified:** Two separate queries, no transaction wrapper. The use case (`get-session-history.ts`) doesn't wrap in a transaction either.

**Problem:** `total` can be stale relative to `rows`. Low probability — this is a single-user history page, and sessions complete one at a time.

**Fix:** Use `COUNT(*) OVER()` window function in a single query, or wrap in a transaction.

---

### BUG-171: Stripe checkout `retrieve` failure silently skips session expiry

**File:** `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:147-164`
**Verified:** When `retrieve` throws, `existingPriceId` stays `undefined`. Line 160: `undefined === priceId` → false (correct, don't reuse). Line 164: `undefined` is falsy → skips the expire block. Old session stays open.

**Problem:** Stale open Stripe checkout sessions accumulate when `retrieve` fails. Auto-expires in 24h. Stripe's `ALREADY_SUBSCRIBED` check prevents duplicate subscriptions, so no billing impact.

**Fix:** After the catch block, attempt to expire the old session best-effort regardless of whether `existingPriceId` was retrieved.

---

### BUG-172: `storeError` failure masks original execute error in idempotency handler

**File:** `src/adapters/shared/with-idempotency.ts:88-96`
**Verified:** If `storeError()` throws, `throw error` at line 95 never runs. Original business error is lost. Very unlikely — key TTL is 24 hours.

**Fix:**
```ts
} catch (error) {
  try {
    await input.repo.storeError({ ... });
  } catch (storeErr) {
    input.logger.error({ storeErr, originalError: error }, 'Failed to store idempotency error');
  }
  throw error;
}
```

---

### BUG-173: `get-session-history` adjusts `total` by `skippedCount` incorrectly

**File:** `src/application/use-cases/get-session-history.ts:102`
**Verified:** Dead code path — `findCompletedByUserId` filters `endedAt IS NOT NULL`, so `skippedCount` is always 0. But the math is wrong if it ever fires: page-local skips subtracted from global count.

**Fix:** Remove the `skippedCount` adjustment. Log `INTERNAL_ERROR` if a row with null `endedAt` appears.

---

### BUG-175: Subscription repository calls `this.now()` twice in single upsert

**File:** `src/adapters/repositories/drizzle-subscription-repository.ts:86,96`
**Verified:** Line 86 (`values` block) and line 96 (`onConflictDoUpdate` block) both call `this.now()`. In production, the INSERT path and conflict-update path get different timestamps (milliseconds apart).

```ts
.values({
  updatedAt: this.now(),       // call #1
})
.onConflictDoUpdate({
  set: {
    updatedAt: this.now(),     // call #2 — different timestamp
  },
});
```

**Problem:** Subtle `updatedAt` drift between INSERT and conflict-update paths.

**Fix:** Capture `const now = this.now()` once before the query and use it for both paths.

---

### BUG-176: Stripe webhook controller hardcodes `Date.now()` for prune cutoff

**File:** `src/adapters/controllers/stripe-webhook-controller.ts:113`
**Verified:** `StripeWebhookDeps` type has no `now` injection point.

```ts
const cutoff = new Date(Date.now() - STRIPE_EVENTS_RETENTION_MS);
```

**Problem:** The cutoff clock is not dependency-injected, so tests rely on global fake timers (`vi.setSystemTime`) instead of explicit clock injection via deps. This is a consistency/ergonomics issue, not a hard testability blocker.

**Fix:** Add `now: () => Date` to `StripeWebhookDeps` and use `deps.now()` instead of `Date.now()`.

---

### BUG-177: Non-atomic SELECT + DELETE in all 3 pruning paths

**Files:**
- `src/adapters/repositories/drizzle-stripe-event-repository.ts:88-112`
- `src/adapters/repositories/drizzle-idempotency-key-repository.ts:174-200`
- `src/adapters/gateways/drizzle-rate-limiter.ts:99-121`

**Verified:** All three pruning methods use a two-step pattern (SELECT rows/keys → separate DELETE). That is structurally non-atomic.

**Problem:** Race risk exists but differs by implementation:
- Stripe events path deletes by ID only (highest race risk among the three).
- Idempotency path includes `expiresAt < cutoff` in DELETE conditions (race mitigated; covered by repository tests).
- Rate-limit path uses immutable `(key, windowStart)` rows with a 90-day cutoff, so practical race impact is very low.

**Fix:** Use `DELETE ... WHERE id IN (SELECT id ... LIMIT N)` as a single atomic query, or wrap in a transaction.

---

## P4 — Trivial (code smells)

### BUG-178: `DrizzleRateLimiter.limit` defaults count to 1 on missing row

**File:** `src/adapters/gateways/drizzle-rate-limiter.ts:66`
**Verified:** `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` always returns a row in Postgres. The `?? 1` fallback can't fire in standard Postgres. If it somehow did, defaulting to 1 would be the least harmful outcome (permissive rather than blocking).

**Fix:** Throw `INTERNAL_ERROR` if `row` is undefined instead of silently defaulting.

---

### BUG-179: `findBySessionId` has no LIMIT clause

**File:** `src/adapters/repositories/drizzle-attempt-repository.ts:231-241`
**Verified:** Sessions are bounded by question count (~20-40). Retry attempts add rows but are bounded by user behavior. Practical maximum is ~60-120 rows per session, which is fine.

**Fix:** Add `limit: 500` as a safety cap, or add a code comment documenting the intentional unbounded read.

---

## False Positives Removed

These were in the initial draft but verified as NOT bugs:

| ID | Original Claim | Verdict |
|----|---------------|---------|
| ~~BUG-177~~ (old) | `getStemPreview` returns raw truncation when `maxLength <= 3` | **Not a bug.** When `maxLength ≤ 3`, there's no room for "..." plus content. Returning raw characters is the correct behavior. |
| ~~BUG-178~~ (old) | TOCTOU pre-check in `start-practice-session` is redundant | **Not a bug.** The pre-check is a deliberate fast-path that avoids expensive question-shuffling work when a session already exists. The DB constraint is the safety net. Good architecture. |
| ~~BUG-174~~ | `checkout-success-sync` guards `logger.warn` as optional | **Not a bug.** `CheckoutSuccessLogger.warn` is explicitly optional in `checkout-success-types.ts`, and tests cover the no-`warn` path (`page.test.ts` "logs retry entries via error when warn is undefined"). |

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
| **useEffect cleanup** | All 18 effects reviewed — async effects return cleanup, sync effects don't need it |
| **Server action validation** | All 4 server actions delegate to controllers with Zod schemas |
| **Controller error handling** | All wrapped by `createAction` with top-level try/catch → `ActionResult` |

---

## Recommended Fix Order

| Priority | Bug | Effort | Description |
|----------|-----|--------|-------------|
| 1 | BUG-168 | Small | `GetNextQuestionUseCase` skips current question — highest user impact |
| 2 | BUG-167 | Trivial | Missing `isMounted()` guard — one-line fix |
| 3 | BUG-175 | Trivial | Subscription repo double `this.now()` — capture once |
| 4 | BUG-172 | Small | `storeError` masking — simple try/catch wrapper |
| 5 | BUG-176 | Small | Stripe webhook hardcoded `Date.now()` — add `now` to deps |
| 6 | BUG-169 | Small | Idempotency poll error classification — add post-break logic |
| 7 | BUG-173 | Trivial | Session history dead code — remove skippedCount adjustment |
| 8 | BUG-170 | Medium | Non-atomic pagination — window function or transaction |
| 9 | BUG-171 | Medium | Stripe checkout stale sessions — careful Stripe API flow |
| 10 | BUG-177 | Medium | Non-atomic pruning (3 files) — single-query DELETE |
| 11 | BUG-178 | Trivial | Rate limiter fallback — change `?? 1` to throw |
| 12 | BUG-179 | Trivial | `findBySessionId` — add safety cap or comment |
