# DEBT-438: Conflict-Reason Contract Coverage Gaps — `StateChangedConcurrently` Unused by Any Client, Wait-Timeout CONFLICT Unannotated

**Status:** Open
**Priority:** P4
**Date:** 2026-07-05

---

## Description

The DEBT-426 conflict-reason contract (`PracticeSessionConflictReasons` transported via `ActionResult.error.details`) shipped end-to-end, but client and wrapper adoption stopped at the exam-expiry predicate. Two coverage gaps remain (the *bug-grade* instances of this pattern are filed separately as BUG-277/280/282; this item tracks the residual UX/annotation debt):

1. **`StateChangedConcurrently` is faithfully produced and transported but no client code ever reads it.** After CAS/serialization retry exhaustion, `practiceSessionStateChangedConcurrentlyError()` reaches the client (`practice-session-question-state-updater.ts:189`, `lib/container/use-cases.ts` retry runner), and the idempotency policy correctly declines to cache it — but the only reasons any client consumes are `AlreadyEnded`/`ExamTimeExpired` inside `isExamExpiryDraftSaveConflict` ([`question-flow-actions.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L169-L178>)). The result: a failed **mark-for-review toggle** or draft save that loses a two-tab race replaces the entire question view with a full-screen `loadState: 'error'` panel showing the raw server message "Practice session state changed concurrently; please retry." ([`use-practice-session-mark-for-review.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts#L113-L125>)) — for what is a retryable, per-question write whose reason is sitting unread in the result.
2. **The idempotency wait-timeout CONFLICT is unannotated and funnels into wrong messaging.** [`with-idempotency.ts`](../../src/adapters/shared/with-idempotency.ts#L266-L269) throws `CONFLICT 'Request timed out waiting for idempotency key…'` with no `details`. On the finalize/end surface, the client's catch-all CONFLICT→summary recovery then fails against a still-running winner and surfaces "Practice session has not ended" — an unrelated message for a transient in-progress condition. On submit surfaces the raw wait-timeout string is shown verbatim. A distinct reason (e.g. `ConcurrentRequestInProgress`) would let clients render "still processing — retrying…" and briefly re-poll instead.

## Impact

Jarring, trust-eroding error UX for recoverable conditions: a toggle failure nukes the question view; a duplicate-click timeout reports a false session state. No data risk anywhere in this item — every underlying write is correctly refused or correctly in flight — hence P4.

## Resolution

1. Client: handle `StateChangedConcurrently` at the mutation call sites (mark-toggle, draft save) with a targeted revert-and-toast (or one silent refetch-and-retry) instead of promoting to full-screen `loadState: 'error'`. Keep full-screen for reason-less failures.
2. Wrapper: annotate the wait-timeout CONFLICT with a dedicated reason; on surfaces with CONFLICT recovery, branch on it (brief re-poll / "still processing" state) before falling through to summary recovery.
3. Keep the fail-safe default throughout: unknown/absent reason → current generic behavior.

## Verification

- Browser-mode spec: losing mark-toggle race renders a reverted toggle + toast, not `loadState: 'error'`.
- Unit: wait-timeout CONFLICT carries the new reason; `isPracticeSessionConflictReason` accepts it; replay through the idempotency store preserves it.

## Related

- [BUG-277](../bugs/bug-277-exam-expiry-finalize-stale-flush-aborts-finalization.md), [BUG-280](../bugs/bug-280-double-finalize-race-maps-to-reasonless-conflict.md), [BUG-282](../bugs/bug-282-tutor-two-tab-ended-session-dead-end-loop.md) — the bug-grade instances of the same pattern; fixing them first will likely reshape this item's remaining scope.
- Archived DEBT-426 — origin of the reason contract.
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (line-level verification against `e3853656`).
