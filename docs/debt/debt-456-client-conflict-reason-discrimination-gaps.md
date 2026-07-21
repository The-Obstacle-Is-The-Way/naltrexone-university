# DEBT-456: Bare `code === 'CONFLICT'` Client Arms Misroute the New Email-Ownership Conflict Into Practice-Session Recovery UX

**Status:** Open
**Priority:** P4
**Date:** 2026-07-11
**Re-verified accurate against `ddad8eee` on 2026-07-18.**

---

## Direction (2026-07-21 forest review)

| Part | Verdict | Chosen option | Rejected as disproportionate | One-line rationale |
| --- | --- | --- | --- | --- |
| 1. Bare client `CONFLICT` arms | **FIX (Steps 1-3, minimal form)** | Reason-check both arms using the existing shared `isPracticeSessionConflictReason`/`getActionResultPracticeSessionConflictReason` contract. Allow known practice-session reasons and the two APIs' currently required reasonless legacy outcomes into recovery; route any known non-session or unknown reason to the generic server-message path without retry, summary probe, or key rotation. Pin both wrong-routing cases and the retained legacy/session recoveries. | Keeping bare code-only branching; a second predicate or client-only reason union; exhaustive UI for every application conflict reason. | (a) Reuses the existing shared discriminator instead of adding a policy copy; (b) both misroutes are source-reachable and union widening has already occurred; (c) Blast radius: a rare auth conflict wastes one request/key and flashes the wrong recovery. Fix cost: two guards plus focused tests; (d) applies DEBT-438's allowlisted targeted-arm/fail-safe default; (e) gives all practice recovery arms one reason contract. |

Targeted recovery is opt-in by machine-readable reason; known non-session and unknown reasons fail safe with the server message. The reasonless exception is compatibility-scoped to the existing bootstrap/end APIs because `getPracticeSessionSummary` and `end()` still emit live bare conflicts; it is not permission for new reasonless emitters. The source already owns the predicate, so future fix work must reuse it rather than create another classifier.

## Description

PR #628 made every authenticated action able to fail with `UserEmailOwnershipConflictError` (code `CONFLICT`, `details.reason = user_email_owned_by_another_identity`) via `requireEntitledUserId` → `ensureClerkUser` ([clerk-user-provisioner.ts#L295-L321](../../src/adapters/gateways/clerk-user-provisioner.ts#L295)); `handleError` forwards code and details verbatim ([action-result.ts#L51-L52](../../src/adapters/controllers/action-result.ts#L51)). Two client arms branch on `result.error.code === 'CONFLICT'` without checking `details.reason` and therefore route this auth-level conflict into practice-session recovery flows:

- [`use-practice-session-page-model.ts#L446`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L446>) treats a bootstrap-summary CONFLICT as maybe-session-ended and calls `questionFlow.onTryAgain` — a silent reload that fails again on the same auth conflict before terminating in an error state.
- [`practice-session-page-logic.ts#L239`](<../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts#L239>) treats an end/finalize CONFLICT as session-ended and probes `getPracticeSessionSummary`, burning the single recovery attempt and an idempotency-key rotation on an error that has nothing to do with the session.

The widened `ApplicationConflictReason` union ([question-flow-actions.ts#L227-L233](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L227>)) has no consumer for the new reason anywhere in `app/` — the typed discriminator PR #628 shipped is dead on the client.

> **Anchor drift (2026-07-14, PR #640):** the BUG-289/290/291 fix shifted this doc's pinned lines without changing either arm's behavior: the `practice-session-page-logic.ts` bare-CONFLICT arm cited above at `#L239` now sits at `#L241`, and the `question-flow-actions.ts` union block moved a few lines down (new imports). Both arms remain bare (verified during that PR's review); the `use-practice-session-page-model.ts#L446` citation is unchanged. PR #640 also widened the union again (`feedback_request_token_reused`, consumed only by the feedback helpers) — the fail-safe-vs-targeted-arm work this item tracks still applies to the new reason's non-consumers.

> **Anchor drift (2026-07-21 forest review):** the page-logic bare arm has since moved from the stamped `#L241` to [`practice-session-page-logic.ts#L270`](<../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts#L270>); the bootstrap arm remains at [`use-practice-session-page-model.ts#L446`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L446>). The union is no longer local to `question-flow-actions.ts`: [`ApplicationConflictReasons`](../../src/application/errors/application-errors.ts#L17-L25) includes the later `feedback_request_token_reused` widening, and the shared [`isPracticeSessionConflictReason`](../../src/application/errors/application-errors.ts#L75-L81) predicate plus action-result helper already exist. Both client arms remain bare, so the direction changes “extract” to “reuse” without weakening the finding.

Verification during the wave-1 close review capped the harm below the original finding's framing: both arms' **terminal** error surfaces are accurate (the downstream ended-session recovery is reason-checked via `isPracticeSessionAlreadyEndedActionConflict`, and the final message is the server's real "Email is already associated with another identity"). The defect is wrong **intermediate** routing only: a loading flash, one wasted server round-trip per arm, and an unnecessary idempotency-key rotation. Reachability requires the conflict to emerge mid-session (at page load the RSC auth guard fails first) — e.g., a Clerk primary-email change colliding with a stale local row while a session page is open; that is precisely the fail-closed state PR #628 was built to emit.

## Impact

Wrong intermediate UX and non-obvious diagnostics on an already-rare fail-closed identity state; no corruption, no loop, accurate terminal message. P4. The deeper cost is the pattern: any future reason added to the union inherits every bare-CONFLICT arm by default — the same class DEBT-438 fixed for `StateChangedConcurrently`/`ConcurrentRequestInProgress` at other call sites.

## Proposed Resolution

1. **CHOSEN, minimal form:** Reason-check the two arms using the DEBT-438 pattern: route known practice-session reasons and the currently required reasonless legacy outcomes into session recovery; let known non-session or unknown reasons take the generic fail-safe error path with the server message, skipping the summary probe and key rotation.
2. **CHOSEN AS REUSE, corrected minimal form:** Reuse the existing shared `isPracticeSessionConflictReason` predicate and `getActionResultPracticeSessionConflictReason` helper. Do not extract a duplicate predicate or define a client-local union.
3. **CHOSEN, required proof:** Pin with unit/browser tests: an action result carrying `user_email_owned_by_another_identity` at each arm renders the generic error with the server message, performs no summary probe, no `onTryAgain` reload, and no key rotation; known practice-session and live reasonless legacy recoveries stay green. Bare code-only branching is rejected.

## Verification

The two cited arms no longer use code-only `CONFLICT` routing; a source scan under `app/` finds only reason-discriminated or explicitly compatibility-scoped reasonless sites. The new-reason tests above pass, the bootstrap/end reasonless controls remain green, and DEBT-438's shipped targeted-arm/fail-safe behaviors stay pinned.

## Related

- [DEBT-438 (archived, resolved PR #608)](../_archive/debt/debt-438-conflict-reason-client-coverage-gaps.md) — established the targeted-arm/fail-safe pattern this item extends to the new reason.
- [BUG-284 (archived, resolved PR #628)](../_archive/bugs/bug-284-user-upsert-email-reclaim-cross-identity-takeover.md) — introduced the reason; its fix scope deliberately excluded client UX arms.
- Found during the 2026-07-11 wave-1 close adversarial regression review (error-contract-consumers lens; verified end-to-end with the overstated sub-claims corrected).
