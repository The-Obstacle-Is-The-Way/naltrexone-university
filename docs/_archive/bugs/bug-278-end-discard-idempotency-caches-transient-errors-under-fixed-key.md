# BUG-278: End/Discard Idempotency Caches Transient Errors Under a Never-Rotating Key, Bricking Session Abandonment for 24 Hours

**Status:** Resolved
**Severity:** P2
**Date:** 2026-07-05
**Confirmed:** 2026-07-05
**Component:** Practice / Session Lifecycle / Idempotency

---

## Summary

`endPracticeSession` and `discardPracticeSession` are the session-lifecycle idempotent mutations wired **without** the `shouldCacheError` policy seam, so *every* execution error — including transient ones — is durably cached for the 24-hour idempotency TTL. On the incomplete-session abandon surface the client's idempotency key is the raw `sessionId`, which by construction never rotates. The combination means one transient failure (connection blip, deadlock victim, unmapped infrastructure error) permanently poisons the key: every subsequent attempt to end/discard that session replays the cached failure until the TTL expires. Reloading does not help — the key is deterministic.

There is a concrete, non-hypothetical transient trigger on this exact surface: `discard()` is a bare autocommit `DELETE` that locks the parent `practice_sessions` row first and then cascades to the child state rows, while an in-flight expiry finalize locks child state rows first and the parent row last — a textbook AB-BA deadlock. When Postgres picks the discard as the victim, the raw `40P01` surfaces as an unmapped error (there is no retry on the discard path), gets classified as a cacheable execution error, and is stored under the un-rotatable key.

## Reachability

Any user with an incomplete session who hits one transient failure while abandoning it. The deadlock variant needs a discard racing an expiry auto-finalize on the same exam session (e.g., user clicks "Discard" on the incomplete-session prompt at the moment the expired exam is being auto-finalized by a question load in another tab) — a narrow but real window that Track A's own retry design acknowledges by listing `40P01` as retryable on the finalize side.

## Reproduction

Deterministic form (fault injection):

1. Open the practice page with an incomplete session so the abandon prompt renders.
2. Inject one transient failure into the end/discard use case (kill the DB connection for one request, or force a `40P01`).
3. Click "Discard" (or "End") — the request fails; the error is cached under `(userId, 'practice:discardPracticeSession', sessionId)`.
4. Click again. And again. Reload and click again.

Expected: step 4 retries the operation and succeeds — the failure was transient.

Actual: every attempt replays the cached error from the idempotency store without re-executing, for up to `DEFAULT_TTL_MS = DAY_MS`. (For a raw non-`ApplicationError`, the first action response is controller-normalized while the cached row stores an `INTERNAL_ERROR` record from `toErrorRecord`; the defect is the cached non-reexecution, not byte-identical UI text.) The user cannot abandon the session for a day.

## Root Cause

Three facts compose:

1. **No error-caching policy on end/discard.** [`practice-controller.ts`](../../../src/adapters/controllers/practice-controller.ts#L261-L282) (`endPracticeSession`) and [`practice-controller.ts`](../../../src/adapters/controllers/practice-controller.ts#L284-L320) (`discardPracticeSession`) call `executeIdempotent` without `shouldCacheError`. Contrast `finalizeExamAnswers` on the same file, which passes `shouldCachePracticeSessionStateWriteError`. In the wrapper, no policy means every execute error is cached ([`with-idempotency.ts`](../../../src/adapters/shared/with-idempotency.ts#L176-L193)). `startPracticeSession` is also idempotent and has a different start-session/rate-limit profile; this bug is scoped to the abandonment actions whose retry key is fixed to an existing incomplete session.
2. **The abandon surface's key never rotates.** [`practice-page-incomplete-session.ts`](<../../../app/(app)/app/practice/practice-page-incomplete-session.ts#L89>) passes `idempotencyKey: input.sessionId` — deterministic and stable across retries and reloads. Contrast the `[sessionId]` page's end flow, which rotates its key on failure ([`practice-session-page-logic.ts`](<../../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts#L249>)).
3. **A real transient error exists on this path.** [`drizzle-practice-session-repository.ts`](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L451-L461): `discard()` is a bare autocommit DELETE (parent row lock → cascade to child rows). An in-flight finalize ([`finalize-exam-answers.ts`](../../../src/application/use-cases/finalize-exam-answers.ts#L120-L253)) updates child state rows first and writes the parent row last via `end()`. Opposite lock order → AB-BA deadlock → Postgres kills one side with `40P01`. The finalize side retries (`RETRYABLE_PRACTICE_SESSION_STATE_WRITE_CODES` includes `40P01` in [`lib/container/use-cases.ts`](../../../lib/container/use-cases.ts)); the discard side has no retry and no mapping, so the raw failure propagates — and is then cached per fact 1.

Note the intended semantics: end/discard are natural idempotent operations whose *success* caching is fine, and whose only correct-to-cache errors are monotone facts (e.g. `CONFLICT 'Practice session already ended'`). Transient infrastructure errors are exactly what the DEBT-435/PR #556 `shouldCacheError` seam was built to exclude — these two actions just never adopted an appropriate policy.

## Impact

A user's "End session" / "Discard" button can stop working for 24 hours with no recovery path available to them (retry, reload, and navigation all replay the cached error). Because an incomplete session blocks starting a new one (partial unique index on `user_id WHERE ended_at IS NULL`), the user is locked out of starting any new practice session for the TTL. Low trigger probability per request, but unbounded blast radius per occurrence and zero self-healing — P2.

## Proposed Fix

1. Pass a `shouldCacheError` policy to both `endPracticeSession` and `discardPracticeSession` that caches only monotone terminal errors and never caches raw/unmapped infrastructure failures or `INTERNAL_ERROR`. Do **not** reuse `shouldCachePracticeSessionStateWriteError` as-is unless the transient path is first mapped to `StateChangedConcurrently`: that policy only exempts `details.reason === StateChangedConcurrently`, so a raw `40P01` or connection failure would still be cached. The uncached error aborts the claim (existing wrapper behavior), so retries re-execute.
2. Add retry-or-mapping for `40P01` on the discard path (either route discard through the composition-root retry runner, or catch-and-map the deadlock code with one retry). The deadlock pair itself can also be removed by making `discard()` take locks in child-first order (delete state rows, then the session row) inside a transaction — matching finalize's order.
3. Optionally rotate the abandon-surface key on failure like the `[sessionId]` page already does — defense in depth, not the primary fix.

## Failing Test Sketch

```typescript
it('re-executes end/discard after a transient failure instead of replaying a cached error', async () => {
  let calls = 0;
  const execute = vi.fn(async () => {
    calls += 1;
    if (calls === 1) throw new ApplicationError('INTERNAL_ERROR', 'transient blip');
    return { discarded: true };
  });

  await expect(runDiscardWithIdempotency({ key: sessionId, execute })).rejects.toThrow('transient blip');
  // Today: the second call replays the cached INTERNAL_ERROR and never re-executes (calls stays 1).
  await expect(runDiscardWithIdempotency({ key: sessionId, execute })).resolves.toEqual({ discarded: true });
  expect(calls).toBe(2);
});
```

## Resolution

Resolved by PR #562 (squash `c9e91b4b`) and promoted to production by PR #564 (merge commit `4e923359dfd391206baf6887f3ab4a1e470e3152`).

The fix added an end/discard-specific idempotency error policy that caches only monotone practice-session conflicts, keeps transient/internal failures uncached so the claim is aborted and retryable, makes `discard()` delete child state rows before the parent session row, and rotates the incomplete-session abandon idempotency key after failures.

## Verification

- Fix PR: #562, squash `c9e91b4b`.
- Promotion PR: #564, merge commit `4e923359dfd391206baf6887f3ab4a1e470e3152`.
- Regression proof: [`practice-controller-session-lifecycle-idempotency-policy.test.ts`](../../../src/adapters/controllers/practice-controller-session-lifecycle-idempotency-policy.test.ts) pins that transient end-session failures, non-terminal discard `ApplicationError`s, and internal discard failures re-execute on the reused idempotency key, while terminal conflicts replay with structured reasons. [`drizzle-practice-session-repository-session-writes.test.ts`](../../../src/adapters/repositories/drizzle-practice-session-repository-session-writes.test.ts) pins child-first discard ordering inside one `repeatable read` transaction.
- Production deploy: GitHub deployment `5331520979`, Vercel target `https://naltrexone-university-cosiyzvs9-john-h-jungs-projects.vercel.app`, succeeded 2026-07-06T15:13:34Z.
- Health proof: `https://addictionboards.com/` and the Vercel deployment URL both returned HTTP/2 200 after the promo; Vercel runtime logs for the checked deployment window contained only the two successful HEAD requests and no errors.

## Related

- DEBT-424 (archived) built the fenced claim/abort machinery; DEBT-435/PR #556 (archived) built the `shouldCacheError` seam and applied it to submit/draft/finalize — end/discard were missed.
- [BUG-279](bug-279-idempotency-wrapper-caches-error-after-committed-success.md) — a wrapper-level defect that compounds with this one (it *generates* wrongly-cached errors; this bug makes them unrecoverable on this surface).
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (five independent DDIA-lens reviewers; line-level verification against `e3853656`).
