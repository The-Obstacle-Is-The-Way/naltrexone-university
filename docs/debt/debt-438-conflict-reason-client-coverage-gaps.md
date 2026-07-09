# DEBT-438: Conflict-Reason Contract Coverage Gaps — `StateChangedConcurrently` Has No Targeted Client UX, Wait-Timeout CONFLICT Unannotated

**Status:** Open
**Priority:** P4
**Date:** 2026-07-05

---

## Description

The DEBT-426 conflict-reason contract (`PracticeSessionConflictReasons` transported via `ActionResult.error.details`) shipped end-to-end, but client and wrapper adoption stopped short of giving every reason a behavior. After the bug-grade instances were fixed and archived ([BUG-277](../_archive/bugs/bug-277-exam-expiry-finalize-stale-flush-aborts-finalization.md), [BUG-280](../_archive/bugs/bug-280-double-finalize-race-maps-to-reasonless-conflict.md), [BUG-282](../_archive/bugs/bug-282-tutor-two-tab-ended-session-dead-end-loop.md)), two residual UX/annotation gaps remain:

1. **`StateChangedConcurrently` is faithfully produced and transported but has no targeted retryable UX.** After CAS/serialization retry exhaustion, `practiceSessionStateChangedConcurrentlyError()` reaches the client from the updater ([`practice-session-question-state-updater.ts`](../../src/adapters/repositories/practice-session-question-state-updater.ts#L184-L193)) or the composition-root retry runner ([`lib/container/use-cases.ts`](../../lib/container/use-cases.ts#L79-L108)), and the idempotency policy correctly declines to cache it ([`practice-session-idempotency-policy.ts`](../../src/adapters/controllers/shared/practice-session-idempotency-policy.ts#L7-L15)). Draft-save plumbing parses recognized reasons and returns them from `maybeSaveDraftBeforeNavigation` ([`question-flow-actions.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L215-L221>), [`question-flow-actions.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L287-L297>)), but the only behavior-changing predicate is `isExamExpiryDraftSaveConflict`, which acts only on `AlreadyEnded`/`ExamTimeExpired` ([`question-flow-actions.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L204-L213>)). No call site branches on `StateChangedConcurrently` for targeted retry/revert UX. The result: a failed **mark-for-review toggle** that loses a two-tab race replaces the active question panel with the `loadState: 'error'` `ErrorCard` ([`use-practice-session-mark-for-review.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts#L113-L128>), [`practice-view.tsx`](<../../app/(app)/app/practice/components/practice-view.tsx#L490-L506>)) showing the raw server message "Practice session state changed concurrently; please retry." A failed draft save also sets generic `loadState: 'error'` before returning its structured reason to the caller.
2. **The idempotency wait-timeout CONFLICT is unannotated.** [`with-idempotency.ts`](../../src/adapters/shared/with-idempotency.ts#L340-L343) throws `CONFLICT 'Request timed out waiting for idempotency key…'` with no `details`. This is a direct throw, not a cached-error replay. Cached `ApplicationError.details` already persist and replay faithfully ([`with-idempotency.ts`](../../src/adapters/shared/with-idempotency.ts#L35-L45), [`with-idempotency.ts`](../../src/adapters/shared/with-idempotency.ts#L304-L312), [`with-idempotency-practice-session-conflicts.test.ts`](../../src/adapters/shared/with-idempotency-practice-session-conflicts.test.ts#L133-L184)), so the remaining wrapper gap is only the wait-timeout reason. The BUG-277/280/282 fixes removed the known bug-grade misrecoveries, but the wait-timeout remains indistinguishable from a generic in-progress duplicate request. A distinct reason such as `ConcurrentRequestInProgress` would let clients render "still processing — retrying…" and briefly re-poll instead.

## Decision Brief (2026-07-09)

Re-verified against current `origin/dev` / `origin/main` head `c8ea199d`. The item is implementation-ready; no owner product decision is needed beyond accepting the UX copy.

### Recommended implementation shape

1. **`StateChangedConcurrently`: revert/no-op + toast, not full-screen.** The mark-for-review hook is not optimistic today; it only mutates `sessionInfo`/review state on success ([`use-practice-session-mark-for-review.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts#L131-L156>)). For the state-changed reason, keep the visible mark state unchanged, clear the in-flight marker, and emit a lightweight error/info toast such as "That question changed in another tab. Please try again." Do not set global `loadState: 'error'`. Draft-save should similarly avoid replacing the question view for this reason; preserve the current view and let navigation stay put or do one explicit refetch/retry. Unknown or absent reasons must retain the current generic error behavior.
2. **Add `ConcurrentRequestInProgress` to the conflict reason contract.** The most local name is `ConcurrentRequestInProgress` with a string value such as `concurrent_request_in_progress`. It should join the same machine-readable reason transport currently exposed through `ApplicationError.details.reason` and `ActionResult.error.details` ([`application-errors.ts`](../../src/application/errors/application-errors.ts#L17-L39), [`action-result.ts`](../../src/adapters/controllers/action-result.ts#L12-L21), [`action-result.ts`](../../src/adapters/controllers/action-result.ts#L45-L53)). If the implementation finds the existing `PracticeSessionConflictReason` type name too narrow for a generic idempotency wait timeout, rename the contract before adding the reason rather than smuggling a generic reason into a practice-only type.
3. **Risk of doing nothing on wait-timeout:** the app continues to treat "duplicate request still in progress" as a generic conflict. That is safe but noisy; it can make retryable duplicate-click or slow-request races look like a failed domain mutation. This is P4 because the underlying operation is still fenced by DEBT-424 idempotency and no data loss follows.
4. **Fail-safe default stays mandatory.** Absence of `details.reason`, unknown reason strings, or any non-`CONFLICT` error must continue down the existing generic error path. The DEBT-426 safety rule remains: only allowlisted machine-readable reasons get special recovery.

### Test plan

- Browser-mode mark-toggle regression: a `CONFLICT` result with `details.reason = StateChangedConcurrently` keeps the active question visible, leaves the mark state at its previous value, clears `isMarkingForReview`, and emits the chosen toast. A reason-less `CONFLICT` still renders the existing error panel.
- Unit/browser draft-save regression: `maybeSaveDraftBeforeNavigation` / its caller does not promote `StateChangedConcurrently` to a full-screen exam-expiry recovery or global error; `AlreadyEnded` and `ExamTimeExpired` still take the existing expiry path.
- Unit wrapper regression: the wait-timeout throw carries `details.reason = ConcurrentRequestInProgress`; the reason guard accepts it (or the renamed broader guard accepts it); legacy cached errors without details still replay exactly as today.

## Impact

Jarring, trust-eroding error UX for recoverable conditions: a toggle failure nukes the question view; a duplicate-click timeout reports a false session state. No data risk anywhere in this item — every underlying write is correctly refused or correctly in flight — hence P4.

## Resolution

1. Client: handle `StateChangedConcurrently` at the mutation call sites (mark-toggle, draft save) with the targeted no-op/revert-and-toast behavior above instead of promoting to full-screen `loadState: 'error'`. Keep full-screen for reason-less failures.
2. Wrapper: annotate the wait-timeout CONFLICT with `ConcurrentRequestInProgress` (or the final chosen equivalent); on surfaces with CONFLICT recovery, branch on it (brief re-poll / "still processing" state) before falling through to generic behavior.
3. Keep the fail-safe default throughout: unknown/absent reason → current generic behavior.

## Verification

- Browser-mode spec: losing mark-toggle race renders a reverted/no-op toggle + toast, not `loadState: 'error'`; reason-less `CONFLICT` still renders the current error panel.
- Unit/browser spec: draft-save `StateChangedConcurrently` keeps the current question surface and does not trigger exam-expiry recovery; `AlreadyEnded`/`ExamTimeExpired` still do.
- Unit: wait-timeout CONFLICT carries the new reason; the reason guard accepts it; existing cached-error replay preserves details for cached errors and preserves legacy no-details rows unchanged.

## Related

- [BUG-277](../_archive/bugs/bug-277-exam-expiry-finalize-stale-flush-aborts-finalization.md), [BUG-280](../_archive/bugs/bug-280-double-finalize-race-maps-to-reasonless-conflict.md), [BUG-282](../_archive/bugs/bug-282-tutor-two-tab-ended-session-dead-end-loop.md) — the bug-grade instances of the same pattern, fixed and archived before this residual item was shrunk.
- Archived DEBT-426 — origin of the reason contract.
- Re-verified and converted into an implementation-ready decision brief on 2026-07-09 against `c8ea199d`.
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (line-level verification against `e3853656`).
