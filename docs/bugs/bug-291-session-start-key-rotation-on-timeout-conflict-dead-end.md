# BUG-291: Session Start Rotates Its Idempotency Key on Client Timeout, Turning a Committed Start Into an Incomplete-Session CONFLICT Dead-End

**Status:** Open
**Severity:** P3
**Date:** 2026-07-09
**Confirmed:** 2026-07-09 (multi-agent adversarial sweep; independently re-verified at source before filing)
**Component:** Practice / session start

---

## Resolution State

- 2026-07-13: Implemented on branch `fix/bug-289-291-idempotency-determinacy` in [PR #640 — Fix BUG-289/290/291: determinacy-aware idempotency policies + client key lifecycles](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/640).
- The implementation preserves the start key across indeterminate outcomes and refreshes incomplete-session state after the typed conflict so recovery controls appear without a reload.
- Status remains **Open** until the merged change has post-deploy production proof.

## Summary

`startSession` in [`practice-page-session-start.ts`](<../../app/(app)/app/practice/practice-page-session-start.ts#L97-L108>) rotates the idempotency key for **every** thrown error — including the client-side 15s [`withTimeout`](../../lib/with-timeout.ts#L10-L16) `TimeoutError`. `withTimeout` races promises but supplies no abort signal, so the already-started server-action promise is not canceled by this helper. The `/app/*` route declares a 30-second server budget at [`layout.tsx#L18-L20`](<../../app/(app)/app/layout.tsx#L18-L20>); Next.js defines the [`maxDuration`](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#maxduration) export, and [Vercel documents](https://vercel.com/docs/functions/configuring-functions/duration) that an App Router named export configures the maximum duration and that Vercel terminates invocations which exceed it. Therefore a request can cross the 15-second client deadline and still finish within the server budget; whether that happens often has not been measured.

If the server creates the session and stores `StartPracticeSessionOutput` under the original key ([`with-idempotency.ts#L223-L230`](../../src/adapters/shared/with-idempotency.ts#L223-L230)), a same-key retry would replay it ([`with-idempotency.ts#L319-L333`](../../src/adapters/shared/with-idempotency.ts#L319-L333)) and navigate into the new session. Instead, the rotated-key retry re-executes, hits the incomplete-session guard ([`start-practice-session.ts#L38-L46`](../../src/application/use-cases/start-practice-session.ts#L38-L46)), and surfaces "You already have an incomplete practice session. Resume or abandon it before starting a new one." The page's resume/abandon lookup runs only in its mount effect ([`use-practice-incomplete-session.ts#L42-L49`](<../../app/(app)/app/practice/hooks/use-practice-incomplete-session.ts#L42-L49>)), so a session created after that lookup is not shown until remount/reload.

Rotation remains useful for known **determinate** non-ok results that may be cached under the old key. The [BUG-259 archive](../_archive/bugs/bug-259-in-place-rate-limit-errors-cache-idempotency-retries.md) documented that the existing rotation made start immune to its former cached-`RATE_LIMITED` mechanism; BUG-259's shipped fix has since moved the start limiter to `beforeExecute`, where a denial aborts the claim, so current `RATE_LIMITED` behavior does not itself require rotation. The defect here is applying the same rule to thrown transport/timeouts, whose server outcome is unknown. The sibling rotate-on-`res.ok === false` branch ([`practice-page-session-start.ts#L113-L117`](<../../app/(app)/app/practice/practice-page-session-start.ts#L113-L117>)) also discards the key on the wrapper's wait-timeout CONFLICT (`ConcurrentRequestInProgress`, [`with-idempotency.ts#L344-L353`](../../src/adapters/shared/with-idempotency.ts#L344-L353)); that response expressly says the original request may still be running.

## Reachability

Any signed-in entitled user starting a filtered practice session can reach the mechanism if `practice:startPracticeSession` exceeds the 15-second client timeout but completes before the server terminates it (`SESSION_START_TIMEOUT_MS = STANDARD_MUTATION_TIMEOUT_MS = 15_000`; [`practice-page-session-start.ts#L12`](<../../app/(app)/app/practice/practice-page-session-start.ts#L12>), [`timeout-tiers.ts#L2`](<../../app/(app)/app/shared/timeout-tiers.ts#L2>)). Before the session insert, the path prunes/claims the idempotency row, runs the cache-miss rate-limit hook, checks for an incomplete session, and queries candidate IDs. The code proves the timing window exists; this audit found no production latency measurement establishing its frequency.

## Reproduction

1. Inject enough latency after the request starts to cross 15 seconds but stay within the route's server budget. [`withTimeout`](../../lib/with-timeout.ts#L10-L16) rejects its race with `TimeoutError`; because the helper has no cancellation channel, the request can continue, commit the session, and store the result under the original key.
2. The catch block shows "Request timed out. Please try again." ([`error-message-helpers.ts#L14`](<../../app/(app)/app/shared/error-message-helpers.ts#L14>)) and rotates the key ([`practice-page-session-start.ts#L107`](<../../app/(app)/app/practice/practice-page-session-start.ts#L107>)).
3. The user obeys and clicks Start again. The fresh key re-executes the use case instead of replaying the cached result, and hits the incomplete-session guard ([`start-practice-session.ts#L41-L46`](../../src/application/use-cases/start-practice-session.ts#L41-L46)).
4. The user sees "You already have an incomplete practice session. Resume or abandon it before starting a new one." — but the resume/abandon panel was fetched only on mount, before the session existed, so it is not rendered. Each further Start click uses another fresh key and **re-executes to** the same guard; it does not replay the previous key's cached CONFLICT.

Expected: the retry replays the committed session (same key) and navigates the user into it; or at minimum the CONFLICT is actionable on the current page.

Actual: a dead-end error message. The user's start actually succeeded; recovery requires a full page reload to surface the resume panel.

## Root Cause

- The catch block at [`practice-page-session-start.ts#L97-L108`](<../../app/(app)/app/practice/practice-page-session-start.ts#L97-L108>) treats thrown transport/runtime failures as determinate even though `createAction` normally returns application failures as `ActionResult`. The original key is the only handle to a possibly committed result, yet line 107 rotates unconditionally.
- The `res.ok === false` branch at [lines 113–117](<../../app/(app)/app/practice/practice-page-session-start.ts#L113-L117>) likewise rotates unconditionally, discarding the still-valid key on the wrapper's bounded wait-timeout CONFLICT (`details.reason = ConcurrentRequestInProgress`) — the same root defect DEBT-438 fixed for end/discard without ruling on the start surface (not a duplicate).
- The recovery UI (resume/abandon panel) is mount-time-only ([`use-practice-incomplete-session.ts#L42-L49`](<../../app/(app)/app/practice/hooks/use-practice-incomplete-session.ts#L42-L49>)), so the CONFLICT message points at controls that are not on screen.

**Adjacent outcome boundary:** start opts into [`outcomeStoreFailurePolicy: 'cache-error-and-throw'`](../../src/adapters/controllers/practice-controller.ts#L211-L219). If session creation succeeds but recording `StartPracticeSessionOutput` fails, the original key contains no replayable success and may instead cache an indeterminate `INTERNAL_ERROR`; preserving that key cannot recover the session output. That post-commit failure is distinct from this doc's timeout-with-later-success interleaving. The recovery-panel refetch below also makes it actionable, but the server-side outcome-recording policy requires its own determinacy analysis rather than being silently folded into key preservation.

The `practice_sessions_user_incomplete_uq` partial unique index ([`db/schema.ts#L445-L447`](../../db/schema.ts#L445-L447), mapped to the same CONFLICT in [`drizzle-practice-session-repository.ts#L409-L419`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L409-L419)) prevents two active sessions even if the retry races the first request. The defect is loss of result recovery/actionable UI, not duplicate-session creation.

## Impact

A user whose start times out client-side but commits server-side is told to retry, then walled off by a CONFLICT whose remedy (resume/abandon) is not rendered — an unrecoverable-looking dead-end on the current page, resolved only by a full reload. The idempotent-replay behavior the wrapper provides is defeated on exactly the outcome class it exists for.

Severity rationale (P3, not P2): the trigger requires a response crossing the client deadline while still completing server-side; its production rate is unmeasured. No data is lost, the partial unique index prevents a duplicate active session, and a page reload exposes the recovery panel. Determinate non-ok rotation remains intentional, and the DEBT-438 end/discard surface is already fixed.

## Proposed Fix

1. **RECOMMENDED:** Branch both error paths on determinacy. Preserve the key for thrown transport/runtime errors, including `TimeoutError`, because the server outcome is unknown; application failures normally arrive as non-ok `ActionResult`s. A same-key retry then replays whichever durable outcome the original request recorded, or receives `ConcurrentRequestInProgress` while the original claim is pending. In the non-ok branch, preserve the key for `details.reason = ConcurrentRequestInProgress` and rotate known determinate failures so a stale cached error does not control a later retry. Do not infer determinacy from generic `INTERNAL_ERROR`; the post-commit outcome-store boundary described above needs server-side resolution or the recovery-panel fallback because neither key choice can reconstruct an unstored success payload.
2. **Defense-in-depth UX fix:** on a start `CONFLICT`, refetch `getIncompletePracticeSession` and render the recovery panel when a row exists. Refetching immediately on the original timeout can race the still-running insert, so either poll briefly or perform the decisive refetch after the subsequent conflict. Branch by error code/reason or add a typed incomplete-session reason; do not match the message string.
3. **Minimal copy-only mitigation (weakest, not recommended alone):** special-case the incomplete-session CONFLICT after a timeout with copy directing the user to reload; does not restore the idempotent-replay behavior.

Rejected alternative: blanket removal of key rotation — a determinate execute error can still be cached under the old key even though `RATE_LIMITED` now runs in `beforeExecute`, so the non-ok path must remain reason-branched.

## Related

- [BUG-259 (archived)](../_archive/bugs/bug-259-in-place-rate-limit-errors-cache-idempotency-retries.md) — its "Related hardening" section cites this file's rotation on both paths as the reason `startPracticeSession` was not a reachable instance of the pre-fix cached-rate-limit bug; the shipped fix now runs that limiter in `beforeExecute`.
- [DEBT-438 (archived)](../_archive/debt/debt-438-conflict-reason-client-coverage-gaps.md) — fixed the same discard-key-on-`ConcurrentRequestInProgress` defect on the end/discard surface without rotation; it did not scope or rule on the start surface, so this filing is not a duplicate.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
