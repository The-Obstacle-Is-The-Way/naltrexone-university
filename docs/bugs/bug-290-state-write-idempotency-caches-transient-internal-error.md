# BUG-290: State-Write Idempotency Policy Caches Transient INTERNAL_ERROR — Submit Re-Click and Mark Toggle Replay the Stale Failure

**Status:** Active
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; independently re-verified at source before filing)
**Component:** Idempotency / practice state writes

---

## Summary

[`shouldCachePracticeSessionStateWriteError`](../../src/adapters/controllers/shared/practice-session-idempotency-policy.ts#L10-L14) is a denylist with exactly one entry: it caches every execute error except `details.reason === StateChangedConcurrently`. That means a raw transient DB failure (connection reset, statement timeout `57014`, Neon suspend — anything outside the `40001`/`40P01` retry-and-map set in [`use-cases.ts`](../../lib/container/use-cases.ts#L47-L50)) is normalized to `INTERNAL_ERROR` by `toErrorRecord` ([with-idempotency.ts#L48](../../src/adapters/shared/with-idempotency.ts#L48)) and durably cached under the caller's idempotency key for the default 24h TTL ([with-idempotency.ts#L16](../../src/adapters/shared/with-idempotency.ts#L16)). The policy is wired to `question:submitAnswer` ([question-controller.ts#L269](../../src/adapters/controllers/question-controller.ts#L269)) and `practice:setPracticeSessionQuestionMark` ([practice-controller.ts#L431](../../src/adapters/controllers/practice-controller.ts#L431)).

The server-side caching only becomes a user-facing defect because both clients reuse the same key on retry. The submit key rotates only when a question loads ([question-flow-actions.ts#L193](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L193>)) — never in `runSubmitAnswerFlow`'s error paths ([question-flow-actions.ts#L390-L413](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L390-L413>)) — and the question card with its Submit button stays rendered while `loadState.status === 'error'` ([practice-view.tsx#L549](<../../app/(app)/app/practice/components/practice-view.tsx#L549>)). The mark-for-review key is cleared only on the success path ([use-practice-session-mark-for-review.ts#L172](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts#L172>)). This is the residual [BUG-278](../_archive/bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) explicitly warned about but scoped out of ("Do not reuse `shouldCachePracticeSessionStateWriteError` as-is").

## Reachability

Any signed-in entitled user submitting an answer (Tutor or Exam draft flows using `question:submitAnswer`) or toggling mark-for-review in a session, whenever the underlying use case fails with a transient error that is (a) outside the `40001`/`40P01` in-transaction retry set and (b) occurs while the idempotency store itself remains writable (the `storeError` write must succeed). Both preconditions are real but narrow — hence P3, not P2.

## Reproduction

Submit re-click leg:

1. In Tutor mode, select a choice and click Submit. The action reaches `executeIdempotent` with the current `submitIdempotencyKey` ([question-controller.ts#L262-L270](../../src/adapters/controllers/question-controller.ts#L262-L270)).
2. The use case throws a transient non-`40001`/`40P01` failure (e.g. Neon connection reset). `toErrorRecord` maps it to `{ code: 'INTERNAL_ERROR' }` ([with-idempotency.ts#L48](../../src/adapters/shared/with-idempotency.ts#L48)) and `shouldCachePracticeSessionStateWriteError` returns `true`, so `storeError` persists it ([with-idempotency.ts#L248](../../src/adapters/shared/with-idempotency.ts#L248)).
3. The client's `!res.ok` path sets `loadState` to `error` without rotating the key ([question-flow-actions.ts#L401-L413](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L401-L413>)); the question, the user's selection, and Submit are still rendered ([practice-view.tsx#L549](<../../app/(app)/app/practice/components/practice-view.tsx#L549>)).
4. The user clicks Submit again. The same key hits the existing record and the cached error is thrown without re-execution ([with-idempotency.ts#L308-L316](../../src/adapters/shared/with-idempotency.ts#L308-L316)).

Expected: the retry re-executes the (now healthy) use case and the answer commits.

Actual: the cached `INTERNAL_ERROR` replays deterministically for up to 24h on that key. The ErrorCard's "Try again" does recover — it reloads the question, which mints a fresh key at [question-flow-actions.ts#L193](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L193>) — but it discards the user's selection, and the retry affordance the user naturally reaches for (Submit itself) is permanently broken for that attempt.

Mark-for-review leg: same steps 1-2 against `practice:setPracticeSessionQuestionMark`. The hook mints its key lazily and holds it in a ref ([use-practice-session-mark-for-review.ts#L86-L90](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts#L86-L90>)), and the error path (~L138-L146) returns without clearing it — only success clears at [L172](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts#L172>). After one cached transient failure, every subsequent mark toggle in that session replays the stale error until the page is reloaded.

## Root Cause

Two halves compose:

1. **Server policy caches non-deterministic errors.** [`shouldCachePracticeSessionStateWriteError`](../../src/adapters/controllers/shared/practice-session-idempotency-policy.ts#L10-L14) excludes only `StateChangedConcurrently`; every other error — including raw infrastructure failures that would succeed on retry — is cached as a durable `INTERNAL_ERROR` record. Contrast the sibling [`shouldCachePracticeSessionLifecycleError`](../../src/adapters/controllers/shared/practice-session-idempotency-policy.ts#L17-L29) (the BUG-278 fix), an allowlist that caches only deterministic terminal CONFLICT reasons.
2. **Clients don't rotate keys on failure.** The submit key rotation lives only in the question-load flow ([question-flow-actions.ts#L193](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L193>)); the mark key is cleared only on success ([use-practice-session-mark-for-review.ts#L172](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts#L172>)). Cached-error replay then happens at [with-idempotency.ts#L308-L316](../../src/adapters/shared/with-idempotency.ts#L308-L316).

**Not affected — refuted during verification:** `practice:finalizeExamAnswers` also uses this policy ([practice-controller.ts#L351](../../src/adapters/controllers/practice-controller.ts#L351)), but the end-session client rotates its key on every failure path ([practice-session-page-logic.ts#L226](<../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts#L226>), [#L285](<../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts#L285>)), so cached errors there are orphaned under a never-reused key and are not replayed.

## Impact

A single transient infrastructure blip converts into a deterministic, user-visible failure loop: the Submit re-click replays a stale error instead of retrying (recoverable in one click via "Try again", at the cost of the selection), and mark-for-review is bricked for the remainder of the page lifetime. No data corruption — the underlying write never happened, and recovery paths exist. Severity P3 rather than P2 because the trigger window is narrow: the failure must fall outside the `40001`/`40P01` retry set that already absorbs serialization/deadlock transients, and the idempotency `storeError` write must itself succeed against the same database that just failed the state write.

## Proposed Fix

1. **RECOMMENDED — invert the state-write policy from denylist to allowlist**, mirroring the BUG-278 `shouldCachePracticeSessionLifecycleError` shape: cache only deterministic terminal `ApplicationError`s (terminal practice-session CONFLICT reasons, `VALIDATION`/`NOT_FOUND`/`FORBIDDEN`) and never cache `INTERNAL_ERROR` or raw unmapped errors, so the fenced `abortClaim` path frees the key for a fresh same-key retry.
2. **Defense in depth on the client:** rotate `submitIdempotencyKey` in `runSubmitAnswerFlow`'s error paths (both the thrown-error and `!res.ok` branches) and clear `markRequestIdempotencyKeyRef` on non-ok mark results — keeping the intentional non-rotation for `ConcurrentRequestInProgress`.
3. **Regression test:** add a test parallel to [`practice-controller-session-lifecycle-idempotency-policy.test.ts`](../../src/adapters/controllers/practice-controller-session-lifecycle-idempotency-policy.test.ts) pinning that a transient `INTERNAL_ERROR` on `question:submitAnswer` / `setPracticeSessionQuestionMark` re-executes on same-key retry.

Corrections folded in from adversarial verification (not fix options, but scope boundaries): the `finalizeExamAnswers` leg of the original candidate is refuted (see Root Cause), and "stuck until page reload" is overstated for submit — the ErrorCard "Try again" recovers in one click at the cost of the selection. The reachable defect is the same-key Submit re-click replay plus the page-lifetime mark-toggle brick.

## Related

- [BUG-278](../_archive/bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) (archived) — fixed the same transient-caching failure mode for end/discard only, and its Proposed Fix explicitly flagged this policy's transient caching as unresolved: "Do not reuse `shouldCachePracticeSessionStateWriteError` as-is."
- [DEBT-435](../_archive/debt/debt-435-practice-session-conflict-and-test-hygiene-follow-ups.md) (archived) — ruled only on not caching `StateChangedConcurrently`; did not address transient errors.
- [DEBT-438](../_archive/debt/debt-438-conflict-reason-client-coverage-gaps.md) (archived) — covered conflict-reason UX on the client, a different seam.
- [DEBT-437](../_archive/debt/debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) (archived) — its ACCEPT ruling does not cover this defect.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
