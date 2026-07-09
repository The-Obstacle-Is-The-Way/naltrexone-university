# BUG-291: Session Start Rotates Its Idempotency Key on Client Timeout, Turning a Committed Start Into an Incomplete-Session CONFLICT Dead-End

**Status:** Active
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; independently re-verified at source before filing)
**Component:** Practice / session start

---

## Summary

`startSession` in [`practice-page-session-start.ts`](<../../app/(app)/app/practice/practice-page-session-start.ts#L105-L108>) rotates the idempotency key in its catch block for **every** thrown error — including the client-side 15s [`withTimeout`](../../lib/with-timeout.ts#L10-L16) `TimeoutError`, an **indeterminate** outcome where the un-abortable server action typically continues and commits. The server stores the committed `StartPracticeSessionOutput` under the ORIGINAL key ([`with-idempotency.ts#L223-L230`](../../src/adapters/shared/with-idempotency.ts#L223-L230)), and a same-key retry would replay it ([`with-idempotency.ts#L319-L333`](../../src/adapters/shared/with-idempotency.ts#L319-L333)) and navigate the user into their new session. Instead, the rotated-key retry re-executes, hits the incomplete-session guard ([`start-practice-session.ts#L41-L46`](../../src/application/use-cases/start-practice-session.ts#L41-L46)), and surfaces "You already have an incomplete practice session. Resume or abandon it before starting a new one." — while the page's resume/abandon panel is fetched only on mount ([`use-practice-incomplete-session.ts#L42-L49`](<../../app/(app)/app/practice/hooks/use-practice-incomplete-session.ts#L42-L49>)) and is therefore not on screen until a reload.

Rotation is intentional and REQUIRED for determinate failures — the [BUG-259 archive](../_archive/bugs/bug-259-in-place-rate-limit-errors-cache-idempotency-retries.md) relies on it so honest retries never replay cached `RATE_LIMITED`/`CONFLICT` errors. The defect is applying it to indeterminate outcomes. The sibling rotate-on-`res.ok === false` branch at [line 116](<../../app/(app)/app/practice/practice-page-session-start.ts#L113-L117>) also discards the key on the wrapper's wait-timeout CONFLICT (`ConcurrentRequestInProgress`, [`with-idempotency.ts#L344-L353`](../../src/adapters/shared/with-idempotency.ts#L344-L353)) — the exact case [DEBT-438](../_archive/debt/debt-438-conflict-reason-client-coverage-gaps.md) fixed without rotation, but only on the end/discard surface.

## Reachability

Any signed-in entitled user starting a filtered practice session whose `practice:startPracticeSession` server action exceeds 15s end-to-end (`SESSION_START_TIMEOUT_MS = STANDARD_MUTATION_TIMEOUT_MS = 15_000`; [`practice-page-session-start.ts#L12`](<../../app/(app)/app/practice/practice-page-session-start.ts#L12>), [`timeout-tiers.ts#L2`](<../../app/(app)/app/shared/timeout-tiers.ts#L2>)). The precondition is real but narrow: the idempotency wrapper also runs prune + claim + rate-limit before the use case, and Neon scale-to-zero cold starts plus the candidate-ID query make a >15s round trip plausible under cold conditions.

## Reproduction

1. Cold conditions (Neon cold start or a slow candidate query) push the server action past 15s. [`withTimeout`](../../lib/with-timeout.ts#L15) rejects on the client with `TimeoutError`; the server action is not aborted — it continues, commits the session, and stores the result under the original idempotency key ([`with-idempotency.ts#L223-L230`](../../src/adapters/shared/with-idempotency.ts#L223-L230)).
2. The catch block shows "Request timed out. Please try again." ([`error-message-helpers.ts#L14`](<../../app/(app)/app/shared/error-message-helpers.ts#L14>)) and rotates the key ([`practice-page-session-start.ts#L107`](<../../app/(app)/app/practice/practice-page-session-start.ts#L107>)).
3. The user obeys and clicks Start again. The fresh key re-executes the use case instead of replaying the cached result, and hits the incomplete-session guard ([`start-practice-session.ts#L41-L46`](../../src/application/use-cases/start-practice-session.ts#L41-L46)).
4. The user sees "You already have an incomplete practice session. Resume or abandon it before starting a new one." — but the resume/abandon panel was fetched only on mount, before the session existed ([`use-practice-incomplete-session.ts#L42-L49`](<../../app/(app)/app/practice/hooks/use-practice-incomplete-session.ts#L42-L49>)), so it is not rendered. Every further Start click rotates again and replays the same CONFLICT.

Expected: the retry replays the committed session (same key) and navigates the user into it; or at minimum the CONFLICT is actionable on the current page.

Actual: a dead-end error message. The user's start actually succeeded; recovery requires a full page reload to surface the resume panel.

## Root Cause

- The catch block at [`practice-page-session-start.ts#L97-L108`](<../../app/(app)/app/practice/practice-page-session-start.ts#L97-L108>) does not distinguish determinate failures (safe and necessary to rotate, per BUG-259) from indeterminate ones (`TimeoutError`, where the original key is the only handle to the possibly-committed result). Line 107 rotates unconditionally.
- The `res.ok === false` branch at [lines 113–117](<../../app/(app)/app/practice/practice-page-session-start.ts#L113-L117>) likewise rotates unconditionally, discarding the still-valid key on the wrapper's bounded wait-timeout CONFLICT (`details.reason = ConcurrentRequestInProgress`) — the same root defect DEBT-438 fixed for end/discard without ruling on the start surface (not a duplicate).
- The recovery UI (resume/abandon panel) is mount-time-only ([`use-practice-incomplete-session.ts#L42-L49`](<../../app/(app)/app/practice/hooks/use-practice-incomplete-session.ts#L42-L49>)), so the CONFLICT message points at controls that are not on screen.

No data corruption is possible: the `practice_sessions_user_incomplete_uq` partial unique index ([`db/schema.ts#L417-L418`](../../db/schema.ts#L417-L418), mapped to the same CONFLICT in [`drizzle-practice-session-repository.ts#L410-L419`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L410-L419)) prevents a duplicate session even if the retry races the still-inflight first request.

## Impact

A user whose start times out client-side but commits server-side is told to retry, then walled off by a CONFLICT whose remedy (resume/abandon) is not rendered — an unrecoverable-looking dead-end on the current page, resolved only by a full reload. The idempotent-replay behavior the wrapper provides is defeated on exactly the outcome class it exists for.

Severity rationale (P3, not P2): the trigger requires a >15s server-action round trip (plausible mainly under Neon cold starts / slow candidate queries, not steady-state), no data is lost, no duplicate session can be created (partial unique index + use-case guard), and a page reload fully recovers. Legs the verifier confirmed as not-affected: determinate-failure rotation itself is settled-intentional (BUG-259 depends on it), and the DEBT-438 end/discard surface is already fixed.

## Proposed Fix

1. **RECOMMENDED:** Branch the two error paths on determinacy, mirroring the DEBT-438 end/discard precedent. In the catch block, preserve the key when `error instanceof TimeoutError` (indeterminate — a same-key retry will replay the committed result, or, if the first request is still in flight, receive the wrapper's bounded wait-timeout CONFLICT). In the `res.ok === false` path, preserve the key when the CONFLICT carries `details.reason = ConcurrentRequestInProgress`. Rotate for all other (determinate) failures so the BUG-259 cached-error protection is untouched.
2. **Defense-in-depth UX fix (can ship alone or alongside 1):** when a start attempt fails — at minimum on timeout or on the incomplete-session CONFLICT — refetch `getIncompletePracticeSession` so the resume/abandon panel appears without a reload, turning the dead-end message into an actionable one.
3. **Minimal copy-only mitigation (weakest, not recommended alone):** special-case the incomplete-session CONFLICT after a timeout with copy directing the user to reload; does not restore the idempotent-replay behavior.

Rejected alternative: blanket removal of key rotation — BUG-259 depends on rotation for determinate failures (cached `RATE_LIMITED`/`CONFLICT` errors must not be replayed on honest retries), so any fix must be reason/type-branched.

## Related

- [BUG-259 (archived)](../_archive/bugs/bug-259-in-place-rate-limit-errors-cache-idempotency-retries.md) — established rotate-on-failure as the deliberate client contract for determinate errors; its "Related hardening" section explicitly cites this file's rotation on both paths as the reason `startPracticeSession` was not a reachable instance of that bug.
- [DEBT-438 (archived)](../_archive/debt/debt-438-conflict-reason-client-coverage-gaps.md) — fixed the same discard-key-on-`ConcurrentRequestInProgress` defect on the end/discard surface without rotation; it did not scope or rule on the start surface, so this filing is not a duplicate.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
