# DEBT-456: Bare `code === 'CONFLICT'` Client Arms Misroute the New Email-Ownership Conflict Into Practice-Session Recovery UX

**Status:** Open
**Priority:** P4
**Date:** 2026-07-11

---

## Description

PR #628 made every authenticated action able to fail with `UserEmailOwnershipConflictError` (code `CONFLICT`, `details.reason = user_email_owned_by_another_identity`) via `requireEntitledUserId` → `ensureClerkUser` ([clerk-user-provisioner.ts#L295-L321](../../src/adapters/gateways/clerk-user-provisioner.ts#L295)); `handleError` forwards code and details verbatim ([action-result.ts#L51-L52](../../src/adapters/controllers/action-result.ts#L51)). Two client arms branch on `result.error.code === 'CONFLICT'` without checking `details.reason` and therefore route this auth-level conflict into practice-session recovery flows:

- [`use-practice-session-page-model.ts#L446`](<../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts#L446>) treats a bootstrap-summary CONFLICT as maybe-session-ended and calls `questionFlow.onTryAgain` — a silent reload that fails again on the same auth conflict before terminating in an error state.
- [`practice-session-page-logic.ts#L239`](<../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts#L239>) treats an end/finalize CONFLICT as session-ended and probes `getPracticeSessionSummary`, burning the single recovery attempt and an idempotency-key rotation on an error that has nothing to do with the session.

The widened `ApplicationConflictReason` union ([question-flow-actions.ts#L227-L233](<../../app/(app)/app/practice/shared/question-flow-actions.ts#L227>)) has no consumer for the new reason anywhere in `app/` — the typed discriminator PR #628 shipped is dead on the client.

> **Anchor drift (2026-07-14, PR #640):** the BUG-289/290/291 fix shifted this doc's pinned lines without changing either arm's behavior: the `practice-session-page-logic.ts` bare-CONFLICT arm cited above at `#L239` now sits at `#L241`, and the `question-flow-actions.ts` union block moved a few lines down (new imports). Both arms remain bare (verified during that PR's review); the `use-practice-session-page-model.ts#L446` citation is unchanged. PR #640 also widened the union again (`feedback_request_token_reused`, consumed only by the feedback helpers) — the fail-safe-vs-targeted-arm work this item tracks still applies to the new reason's non-consumers.

Verification during the wave-1 close review capped the harm below the original finding's framing: both arms' **terminal** error surfaces are accurate (the downstream ended-session recovery is reason-checked via `isPracticeSessionAlreadyEndedActionConflict`, and the final message is the server's real "Email is already associated with another identity"). The defect is wrong **intermediate** routing only: a loading flash, one wasted server round-trip per arm, and an unnecessary idempotency-key rotation. Reachability requires the conflict to emerge mid-session (at page load the RSC auth guard fails first) — e.g., a Clerk primary-email change colliding with a stale local row while a session page is open; that is precisely the fail-closed state PR #628 was built to emit.

## Impact

Wrong intermediate UX and non-obvious diagnostics on an already-rare fail-closed identity state; no corruption, no loop, accurate terminal message. P4. The deeper cost is the pattern: any future reason added to the union inherits every bare-CONFLICT arm by default — the same class DEBT-438 fixed for `StateChangedConcurrently`/`ConcurrentRequestInProgress` at other call sites.

## Proposed Resolution

1. Reason-check the two arms (the DEBT-438 pattern): route only known practice-session reasons (`AlreadyEnded`, `ExamTimeExpired`, absent-reason legacy CONFLICTs if required for compatibility) into session-recovery flows; let unknown or non-session reasons take the generic fail-safe error path with the server message, skipping the summary probe and key rotation.
2. Extract a shared `isPracticeSessionConflictReason` predicate next to the existing reason helpers so future arms discriminate by construction instead of by string comparison at each site.
3. Pin with unit tests: an action result carrying `user_email_owned_by_another_identity` at each arm renders the generic error with the server message, performs no summary probe, no `onTryAgain` reload, and no key rotation; the existing session-ended recoveries stay green.

## Verification

The two cited arms no longer match bare `CONFLICT`; grep for `code === 'CONFLICT'` under `app/` returns only reason-discriminated sites; the new-reason unit tests above pass; DEBT-438's shipped behaviors remain pinned.

## Related

- [DEBT-438 (archived, resolved PR #608)](../_archive/debt/debt-438-conflict-reason-client-coverage-gaps.md) — established the targeted-arm/fail-safe pattern this item extends to the new reason.
- [BUG-284 (archived, resolved PR #628)](../_archive/bugs/bug-284-user-upsert-email-reclaim-cross-identity-takeover.md) — introduced the reason; its fix scope deliberately excluded client UX arms.
- Found during the 2026-07-11 wave-1 close adversarial regression review (error-contract-consumers lens; verified end-to-end with the overstated sub-claims corrected).
