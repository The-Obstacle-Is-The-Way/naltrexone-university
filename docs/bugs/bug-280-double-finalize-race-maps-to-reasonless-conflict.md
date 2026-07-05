# BUG-280: Double-Finalize Race Surfaces as a Reason-less "Already Answered" CONFLICT That Gets Cached Under the Loser's Idempotency Key

**Status:** Open
**Severity:** P3
**Date:** 2026-07-05
**Confirmed:** 2026-07-05
**Component:** Practice / Exam Finalize / Attempts

---

## Summary

When two finalizations of the same exam session overlap (two tabs at expiry, or a user's explicit finalize racing the server-side expired-exam auto-finalize), both REPEATABLE READ transactions pass the in-transaction `endedAt` re-check on their pre-commit snapshots. The winner inserts its attempt rows and commits; the loser's first attempt INSERT then fails the `attempts_session_question_uq` partial unique index with `23505`. That error is mapped to `CONFLICT 'This question has already been answered in this session'` with **no `details.reason`** — a message written for the tutor double-submit case, semantically wrong for finalize, where the truth is "the session was already finalized."

Because the CONFLICT carries no reason, `shouldCachePracticeSessionStateWriteError` (which exempts only `StateChangedConcurrently`) caches it under the loser's idempotency key — so retries with that key replay the misleading error instead of converging to the summary. And because `23505` is not in `RETRYABLE_PRACTICE_SESSION_STATE_WRITE_CODES` (`40001`/`40P01` only), the composition-root retry never converts it into a clean re-read that would observe `endedAt` and produce the correct `AlreadyEnded` conflict.

## Reachability

Exam session open in two tabs at the deadline (both timers fire finalize), or one tab's explicit finalize racing another request's expired-exam auto-finalize (`get-next-question.ts` triggers `expiredExamFinalizer` on load of an expired session). The race window is the duration of the winner's finalize transaction.

## Reproduction

1. Open the same exam session in two tabs; let the deadline pass while both are foregrounded (or foreground both within the grace window).
2. Both tabs fire `finalizeExpiredExam` near-simultaneously with distinct idempotency keys.

Expected: one finalize wins; the other observes the ended session and recovers to the summary via the `AlreadyEnded` conflict path (which the client already handles).

Actual: the loser blocks on the winner's uncommitted unique-index entry, then receives `23505` → `CONFLICT 'This question has already been answered in this session'`, reason-less. The client's CONFLICT recovery does fetch the summary (any CONFLICT on the end surface triggers it), which usually saves the UX — but the error is cached under the loser's key, the message is wrong for the situation, and any path that retries the same key replays the stale error rather than re-executing.

## Root Cause

- [`drizzle-attempt-repository.ts`](../../src/adapters/repositories/drizzle-attempt-repository.ts#L186-L195): the `23505`-on-`ATTEMPTS_SESSION_QUESTION_UQ` mapping throws `CONFLICT` with a tutor-double-submit message and no `details`. The mapping is correct for its original audience (per-question tutor submits) and wrong for finalize, which inserts many attempts inside one transaction.
- [`finalize-exam-answers.ts`](../../src/application/use-cases/finalize-exam-answers.ts#L136-L141): the in-transaction `endedAt` check reads the transaction snapshot, which cannot see a concurrently-committing winner under REPEATABLE READ — so the check passes on both sides and the unique index is the actual serializer.
- [`practice-session-idempotency-policy.ts`](../../src/adapters/controllers/shared/practice-session-idempotency-policy.ts): only `StateChangedConcurrently` is exempt from error caching, so this reason-less transient CONFLICT is cached.
- [`db/schema.ts`](../../db/schema.ts#L617-L619): `attempts_session_question_uq` (BUG-105) is the constraint doing the serializing — working as designed; the defect is purely in the error semantics layered on it.

## Impact

The losing finalize records a wrong, cacheable error. UX today is mostly rescued by the end-surface's catch-all CONFLICT→summary recovery, so this is P3 — but the cached wrong outcome under the loser's key is durable state that misrepresents what happened, and any future client change that trusts the cached error (or any reason-based branching on this surface, e.g. the BUG-277 fix) inherits the wrong semantics.

## Proposed Fix

In the finalize path, translate the `23505` loser into the truth: catch the unique-violation CONFLICT inside `FinalizeExamAnswersUseCase` (or map at the repository seam when the insert happens under a finalize), re-read the session, and if `endedAt` is set throw `practiceSessionAlreadyEndedError()` — which carries `details.reason = AlreadyEnded`, is monotone (correct to cache), and drives the existing client recovery. Alternatively (deeper fix): make the loser detectable *before* attempt insertion by having finalize take the parent-row write first (`end()` before attempt inserts), forcing the loser onto the retryable `40001` path — but that reorders Track A's deliberate child-first lock order and must be weighed against [BUG-278](bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md)'s deadlock analysis, not done casually.

## Failing Test Sketch

```typescript
it('maps the double-finalize unique-violation loser to AlreadyEnded, not "already answered"', async () => {
  // Arrange: session already finalized by a concurrent winner; loser's snapshot predates it.
  // Simulate via a repo whose attempt insert throws the 23505-mapped CONFLICT while
  // the session row (re-read outside the stale snapshot) shows endedAt set.
  const error = await useCase.execute({ userId, sessionId }).catch((e) => e);

  expect(error).toBeInstanceOf(ApplicationError);
  expect(error.code).toBe('CONFLICT');
  // Today: message 'This question has already been answered in this session', details undefined.
  expect(error.details?.reason).toBe(PracticeSessionConflictReasons.AlreadyEnded);
});
```

## Related

- BUG-105 (archived) introduced `attempts_session_question_uq` — the constraint is correct; this bug is about the error mapped onto it in a new (finalize) context.
- [BUG-277](bug-277-exam-expiry-finalize-stale-flush-aborts-finalization.md) — sibling reason-less CONFLICT on the same finalize surface.
- [DEBT-438](../debt/debt-438-conflict-reason-client-coverage-gaps.md) — the umbrella conflict-reason coverage debt.
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (five independent DDIA-lens reviewers; line-level verification against `e3853656`).
