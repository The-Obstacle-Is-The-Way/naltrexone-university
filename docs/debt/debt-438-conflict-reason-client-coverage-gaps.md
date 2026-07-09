# DEBT-438: Conflict-Reason Contract Coverage Gaps — Implemented, Deploy Proof Pending

**Status:** Open — implementation landed in code; archive after promo/deploy proof
**Priority:** P4
**Date:** 2026-07-05

---

## Description

The DEBT-426 conflict-reason contract now has targeted coverage for the two residual gaps left after the bug-grade instances were fixed and archived ([BUG-277](../_archive/bugs/bug-277-exam-expiry-finalize-stale-flush-aborts-finalization.md), [BUG-280](../_archive/bugs/bug-280-double-finalize-race-maps-to-reasonless-conflict.md), [BUG-282](../_archive/bugs/bug-282-tutor-two-tab-ended-session-dead-end-loop.md)). This doc remains active only until the implementation is promoted and production deploy proof is recorded, then it should move to `docs/_archive/debt/`.

1. **`StateChangedConcurrently` now has targeted retryable UX.** After CAS/serialization retry exhaustion, `practiceSessionStateChangedConcurrentlyError()` still reaches the client from the updater ([`practice-session-question-state-updater.ts`](../../src/adapters/repositories/practice-session-question-state-updater.ts#L184-L193)) or the composition-root retry runner ([`use-cases.ts`](../../lib/container/use-cases.ts#L79-L108)), and the idempotency policy still correctly declines to cache it ([`practice-session-idempotency-policy.ts`](../../src/adapters/controllers/shared/practice-session-idempotency-policy.ts#L7-L15)). The client now parses the broader `ApplicationConflictReasons` transport while preserving the practice-session subset guard ([`question-flow-actions.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L220-L249>)). A losing **mark-for-review toggle** leaves the visible mark state unchanged, clears the in-flight marker, and emits the existing app toast/status affordance instead of replacing the active question with the `loadState: 'error'` `ErrorCard` ([`use-practice-session-mark-for-review.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts#L120-L130>), [`practice-view.tsx`](<../../app/(app)/app/practice/components/practice-view.tsx#L490-L506>)). A failed draft save for the same reason now calls the same transient notice hook and avoids global `loadState: 'error'` ([`question-flow-actions.ts`](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L309-L323>), [`use-practice-session-question-flow.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts#L287-L292>)).
2. **The idempotency wait-timeout CONFLICT is annotated.** `ApplicationConflictReasons` is the broader machine-readable reason contract; the existing `PracticeSessionConflictReasons` object remains the practice-specific subset with unchanged wire values ([`application-errors.ts`](../../src/application/errors/application-errors.ts#L17-L34), [`application-errors.ts`](../../src/application/errors/application-errors.ts#L47-L67)). [`with-idempotency.ts`](../../src/adapters/shared/with-idempotency.ts#L344-L353) now throws the wait-timeout `CONFLICT` with `details.reason = concurrent_request_in_progress`, and idempotency cached-error replay accepts the broader reason set while still dropping unknown strings safely ([`drizzle-idempotency-key-repository.ts`](../../src/adapters/repositories/drizzle-idempotency-key-repository.ts#L17-L28)). The practice-session end/discard conflict recovery path branches on this reason for one short summary re-poll and then reports a bounded "still processing" message without rotating the idempotency key if the request is still unresolved ([`practice-session-page-logic.ts`](<../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts#L232-L285>)).

## Decision Brief (2026-07-09, Pre-Implementation)

Re-verified against `origin/dev` / `origin/main` head `c8ea199d` before implementation. The item was implementation-ready; no owner product decision was needed beyond accepting the UX copy. This section is retained as the design record for the shipped implementation.

### Recommended implementation shape

1. **`StateChangedConcurrently`: revert/no-op + toast, not full-screen.** The mark-for-review hook is not optimistic today; it only mutates `sessionInfo`/review state on success ([`use-practice-session-mark-for-review.ts`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts#L131-L156>)). For the state-changed reason, keep the visible mark state unchanged, clear the in-flight marker, and emit a lightweight error/info toast such as "That question changed in another tab. Please try again." Do not set global `loadState: 'error'`. Draft-save should similarly avoid replacing the question view for this reason; preserve the current view and let navigation stay put or do one explicit refetch/retry. Unknown or absent reasons must retain the current generic error behavior.
2. **Add `ConcurrentRequestInProgress` to the conflict reason contract.** The most local name is `ConcurrentRequestInProgress` with a string value such as `concurrent_request_in_progress`. It should join the same machine-readable reason transport currently exposed through `ApplicationError.details.reason` and `ActionResult.error.details` ([`application-errors.ts`](../../src/application/errors/application-errors.ts#L17-L39), [`action-result.ts`](../../src/adapters/controllers/action-result.ts#L12-L21), [`action-result.ts`](../../src/adapters/controllers/action-result.ts#L45-L53)). If the implementation finds the existing `PracticeSessionConflictReason` type name too narrow for a generic idempotency wait timeout, rename the contract before adding the reason rather than smuggling a generic reason into a practice-only type.
3. **Risk of doing nothing on wait-timeout:** the app continues to treat "duplicate request still in progress" as a generic conflict. That is safe but noisy; it can make retryable duplicate-click or slow-request races look like a failed domain mutation. This is P4 because the underlying operation is still fenced by DEBT-424 idempotency and no data loss follows.
4. **Fail-safe default stays mandatory.** Absence of `details.reason`, unknown reason strings, or any non-`CONFLICT` error must continue down the existing generic error path. The DEBT-426 safety rule remains: only allowlisted machine-readable reasons get special recovery.

### Test plan

- Browser-mode mark-toggle regression: a `CONFLICT` result with `details.reason = StateChangedConcurrently` keeps the active question visible, leaves the mark state at its previous value, clears `isMarkingForReview`, and emits the chosen toast. A reason-less `CONFLICT` still renders the existing error panel.
- Unit/browser draft-save regression: `maybeSaveDraftBeforeNavigation` / its caller does not promote `StateChangedConcurrently` to a full-screen exam-expiry recovery or global error; `AlreadyEnded` and `ExamTimeExpired` still take the existing expiry path.
- Unit wrapper regression: the wait-timeout throw carries `details.reason = ConcurrentRequestInProgress`; the reason guard accepts it (or the renamed broader guard accepts it); legacy cached errors without details still replay exactly as today.

## Impact Before Implementation

The pre-fix impact was jarring, trust-eroding error UX for recoverable conditions: a toggle failure could replace the question view, and a duplicate-click timeout could report a false session state. No data risk existed anywhere in this item — every underlying write was correctly refused or correctly in flight — hence P4.

## Resolution

Implementation state on this branch:

1. Client: `StateChangedConcurrently` at the mark-toggle and draft-save call sites uses targeted no-op/revert-and-toast behavior instead of promoting to full-screen `loadState: 'error'`. Reason-less failures keep the full-screen generic error path.
2. Wrapper: the idempotency wait-timeout `CONFLICT` carries `ConcurrentRequestInProgress`; the end/discard recovery path briefly re-polls summary and otherwise surfaces "still processing" without rotating the still-valid key.
3. Fail-safe default is preserved throughout: unknown/absent reason → current generic behavior.

Archive only after the feature PR is promoted to `main`, production deploy reaches Ready, and site health is verified.

## Verification

- Browser-mode spec: losing mark-toggle race renders a reverted/no-op toggle + toast, not `loadState: 'error'`; reason-less `CONFLICT` still renders the current error panel.
- Unit/browser spec: draft-save `StateChangedConcurrently` keeps the current question surface and does not trigger exam-expiry recovery; `AlreadyEnded`/`ExamTimeExpired` still do.
- Unit: wait-timeout CONFLICT carries the new reason; the reason guard accepts it; existing cached-error replay preserves details for cached errors and preserves legacy no-details rows unchanged.

## Related

- [BUG-277](../_archive/bugs/bug-277-exam-expiry-finalize-stale-flush-aborts-finalization.md), [BUG-280](../_archive/bugs/bug-280-double-finalize-race-maps-to-reasonless-conflict.md), [BUG-282](../_archive/bugs/bug-282-tutor-two-tab-ended-session-dead-end-loop.md) — the bug-grade instances of the same pattern, fixed and archived before this residual item was shrunk.
- Archived DEBT-426 — origin of the reason contract.
- Re-verified and converted into an implementation-ready decision brief on 2026-07-09 against `c8ea199d`.
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (line-level verification against `e3853656`).
