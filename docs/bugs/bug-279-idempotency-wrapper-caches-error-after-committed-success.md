# BUG-279: Idempotency Wrapper Conflates a Failed Outcome-Write With a Failed Execution, Caching an Error for a Request That Succeeded

**Status:** Open
**Severity:** P2
**Date:** 2026-07-05
**Confirmed:** 2026-07-05
**Component:** Shared Adapters / Idempotency Wrapper

---

## Summary

In `executeIdempotent`, one `try` block covers both the business effect (`execute()`) and the recording of its success (`repo.storeResult(...)`). If `execute()` **commits its side effect** and the subsequent `storeResult` attempt fails before it marks the idempotency row completed (connection blip, pool timeout, repository fault), the `catch` cannot tell the difference: it treats the storage failure as an *execution* failure, consults `shouldCacheError` (which approves — it's not a transient practice-session CONFLICT), and calls `storeError` with the same still-valid `claimedAt` fence. That write can succeed because the row is still pending, durably recording an `INTERNAL_ERROR` as the outcome of a request whose business effect is already committed.

The caller is told the request failed after it succeeded, and every same-key retry replays the cached error for the 24-hour TTL. This is the shared wrapper under **all** idempotent server actions — practice mutations and billing-adjacent actions alike — so the blast radius is any effect that commits followed by one transient failure on the outcome write.

## Reachability

Any idempotent action whose `execute()` has committed and whose `storeResult` attempt fails before the success outcome is persisted. Requires a narrowly-timed infrastructure fault, so per-request probability is low — but the wrapper executes on every idempotent mutation in the system, and the consequence is a durable lie (failure-after-success) rather than a transient one.

## Reproduction

Fault injection at the repository seam:

1. Wire `executeIdempotent` with an `execute` that performs a real insert (e.g. submit-answer's attempt row) and a repo whose `storeResult` rejects once with a transient error.
2. Call the action. The insert commits; `storeResult` throws before completing the idempotency row; the wrapper caches `INTERNAL_ERROR` via `storeError` (same claim, still pending, fence passes).
3. Retry with the same key.

Expected: the retry either replays the committed success or re-executes idempotently.

Actual: the retry replays `INTERNAL_ERROR` from the cache without executing anything. The user sees a persistent failure for an operation that succeeded. On the submit surface the client only rotates its key on question load, so the user's realistic escape is a reload — after which the fresh key re-executes against already-committed state (for session submits: a `23505` unique violation surfaced as `CONFLICT 'This question has already been answered in this session'`; for quick practice: a duplicate attempt row).

## Root Cause

[`with-idempotency.ts`](../../src/adapters/shared/with-idempotency.ts#L165-L215):

```typescript
      try {
        const result = await input.execute();
        await input.repo.storeResult({
          userId: input.userId,
          action: input.action,
          key: input.key,
          claimedAt,
          resultJson: result,
        });
        return result;
      } catch (error) {
        if (!shouldCacheExecutionError(input.shouldCacheError, error)) {
          await abortClaimPreservingOriginalError(
            input,
            claimedAt,
            error,
            'Failed to abort idempotency claim after non-cacheable execute error',
          );
          throw error;
        }

        try {
          await input.repo.storeError({
            userId: input.userId,
            action: input.action,
            key: input.key,
            claimedAt,
            error: toErrorRecord(error),
          });
        } catch (storeError) {
          try {
            input.logger.error(
              {
                userId: input.userId,
                action: input.action,
                key: input.key,
                storeError:
                  storeError instanceof Error
                    ? storeError.message
                    : String(storeError),
                originalError:
                  error instanceof Error ? error.message : String(error),
              },
              'Failed to persist idempotency error record',
            );
          } catch {
            // Preserve original execute error even if logger.error throws.
          }
        }
        throw error;
      }
```

A `storeResult` rejection enters the same `catch` as an `execute` rejection. Nothing distinguishes "the effect failed" from "the effect succeeded but recording it failed" — yet the correct handling is opposite: an execute failure may be cached as the outcome; a storeResult failure after the business effect has returned must **never** be recorded as an error outcome.

The `claimedAt` fencing (DEBT-424) is not violated — when the success row was not completed, the row is still pending and owned by this claim, which is exactly why the wrong `storeError` write can succeed. If `storeResult` actually commits and the client merely observes an ambiguous post-commit failure, `storeError` is fenced out by the repository's `completed_at IS NULL` predicate; that adjacent ambiguity is not the reproducible bug documented here.

## Impact

Durable failure-after-success: the idempotency record — the system's source of truth for "did this request happen" — asserts the opposite of the database state, for 24 hours, on the shared wrapper under every idempotent action. Downstream: stuck UI states, duplicate effects after key rotation, and support-defying behavior ("it says it failed but the answer is recorded"). Compounds with [BUG-278](bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) on surfaces whose keys never rotate.

## Proposed Fix

Separate the two failure domains:

```typescript
const result = await input.execute();          // execute-failure handling stays as-is around this
try {
  await input.repo.storeResult({ ..., claimedAt, resultJson: result });
} catch (storeFailure) {
  // Effect is committed. Never storeError here. Log loudly and either:
  //  (a) return result (caller sees success; pending row zombie-reclaims after 60s), or
  //  (b) abortClaim + return result (next same-key retry re-executes — acceptable only
  //      for naturally idempotent effects; (a) is the safe default).
  input.logger.error({...}, 'Idempotency outcome write failed after committed success');
  return result;
}
return result;
```

Option (a) is recommended: the user gets their success, the pending claim self-heals at the zombie threshold, and a same-key retry inside the window gets the bounded poll rather than a lie. Add a red-first test pinning that a `storeResult` failure never produces a stored error record.

## Failing Test Sketch

```typescript
it('does not cache an error outcome when storeResult fails after execute succeeded', async () => {
  const repo = createFakeIdempotencyRepoWithFailingStoreResult({ failures: 1 });
  const execute = vi.fn(async () => ({ ok: true }));

  await runExecuteIdempotent({ repo, execute }); // first call: effect succeeds, storeResult blips

  const record = await repo.find(userId, action, key);
  // Today: record.error is INTERNAL_ERROR (cached failure-after-success).
  expect(record?.error).toBeUndefined();
});
```

## Related

- DEBT-424 (archived) — the claim/fence machinery this bug lives inside (fencing itself is sound).
- [BUG-278](bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) — surface-level policy gap that makes this wrapper defect unrecoverable on end/discard.
- Accepted-design note (not this bug): the 60-second zombie reclaim and the post-TTL reclaim of completed rows are deliberate at-least-once semantics; for quick-practice attempts (no unique index) a crash-retry can duplicate a row. Documented here for the record; any tightening is a separate decision.
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (five independent DDIA-lens reviewers; line-level verification against `e3853656`).
