# BUG-303: Abandoning a Refreshed Session Can Retire the Key for a Different Still-Running Start

**Status:** Open
**Severity:** P4
**Date:** 2026-07-16
**Confirmed:** 2026-07-16 (fix-wave-4 combined-diff adversarial review; confirmed 3/3 by client-owner tracing, a production-hook Chromium reproduction, and the server write-order verifier)
**Component:** Practice / session start / recovery-panel key retirement

---

## Summary

BUG-300 correctly prevents the immediate loaded-null refresh inside `startSession` from retiring a key after `ConcurrentRequestInProgress`. That uncertainty is local to the one helper invocation. It is not carried to BUG-299's later capture-then-retire owner: [`captureIdempotencyKeyRetirement`](<../../app/(app)/app/practice/hooks/use-practice-session-start.ts>) remembers only the key value, and [`use-practice-session-controls.ts`](<../../app/(app)/app/practice/hooks/use-practice-session-controls.ts>) retires it after any successful recovery-panel abandon.

A refreshed incomplete session is not proven to be the effect of the still-running same-key request. The server's [`StartPracticeSessionUseCase`](../../src/application/use-cases/start-practice-session.ts) performs `findLatestIncompleteByUserId`, then lists/shuffles candidate questions, and only later calls `sessions.create`. A different tab can create session S during that gap. The concurrent retry can refresh S; if the user abandons S before the original request reaches `create`, the original request can then create a different session T under the preserved key K. The abandon path has already replaced K, losing the only replay handle to T.

## Reproduction

1. Start request A under K passes the initial incomplete-session check and remains busy selecting questions.
2. Another tab creates incomplete session S.
3. A same-key retry receives typed `concurrent_request_in_progress`; the BUG-300 guard preserves K, and the authoritative refresh renders S.
4. The user abandons S. BUG-299's control path captures K, observes abandon success, and rotates K because the key is unchanged.
5. A reaches `sessions.create` after S is ended, creates session T, and completes under K.
6. The next Start uses fresh K2, reaches the single-incomplete-session conflict for T, and needs another refresh/recovery round trip instead of replaying K.

A temporary Chromium probe through the production `usePracticeSessionControls` hook returned the typed concurrent result, refreshed S, abandoned it successfully, and clicked Start again. The expected same key was not reused; the second call carried a fresh UUID. The server ordering above establishes that the still-running request can create T after that rotation—`create()`'s partial unique constraint protects against simultaneous live sessions, but S has already been ended.

## Impact

The determinacy invariant is violated on a narrower successor path to BUG-300: the client discards the handle to a request that may still commit. The database still prevents two simultaneous incomplete sessions, and a subsequent fresh-key conflict plus refresh surfaces T, so there is no duplicate live-session corruption or permanent dead end. The user incurs a misleading failure/recovery round trip; P4 is appropriate.

## Root Cause

The lifecycle owner models “this captured key has not changed” but not “this key has an execution that may still finish.” BUG-300 added the latter fact as a local boolean inside `startSession`; BUG-299's later abandon owner cannot consult it. A session returned by an uncorrelated per-user refresh is insufficient to prove which request created it.

## Proposed Fix

1. Persist typed per-key concurrent-execution uncertainty at `usePracticeSessionStart`, not only inside one `startSession` call.
2. Let a consumed same-key outcome or another proof that the execution cannot still commit clear that uncertainty. Do not infer identity from whichever per-user incomplete session a refresh returns.
3. Make the capture-then-retire callback refuse retirement while its captured key remains uncertain, while preserving BUG-299 retirement for ordinary post-commit error recovery and external resolution.
4. Add a production-hook Chromium sequence matching the interleaving above and a server/use-case orchestration test proving S can be ended between A's precheck and create.

## Resolution State

Implementation is complete on
`fix/bug-303-abandon-retires-running-start-key` as of 2026-07-17; Status
remains Open until wave-5 archival records production proof.

- `usePracticeSessionStart` now owns per-key concurrent-execution uncertainty.
  Each Start invocation claims the key's current settled version. The typed
  `concurrent_request_in_progress` result marks that key uncertain; a returned
  same-key settled result clears it. Compare-and-set versioning prevents a
  delayed concurrent observation from overwriting a newer settled observation.
  Thrown transport and timeout outcomes publish no settled observation, so
  their key remains preserved.
- `captureIdempotencyKeyRetirement` still rejects a superseded captured key and
  now also rejects a captured key whose same-key execution may still commit.
  Authoritative incomplete-session refresh continues to own panel convergence,
  but the per-user session it returns is never treated as request identity.
- Red-first Chromium proof reproduced the defect through the production
  `usePracticeSessionControls` hook: typed concurrent result → refresh renders
  session S → successful abandon S → next Start carried a fresh UUID instead of
  the preserved key. The green suite proves same-key reuse, settlement clearing,
  and stale-observation compare-and-set ordering. Existing controls remain green
  for ordinary abandon retirement, second-tab proven-absence retirement,
  BUG-300's immediate-refresh guard, and BUG-291's thrown-outcome preservation.
- A use-case orchestration test inserts and ends another tab's session during
  candidate selection—after the initial incomplete-session precheck and before
  the original `sessions.create`—then proves the original request can create its
  distinct session. This pins why session S cannot identify request A.
- PR number, exact approved head, squash SHA, full-gate evidence, and promotion
  proof are delivery facts recorded after their respective steps; the wave-5
  close will replace this implementation-state note with the immutable chain.

## Related

- [BUG-300 (archived)](../_archive/bugs/bug-300-concurrent-start-refresh-retires-pending-key.md) — fixes immediate refresh retirement but does not propagate uncertainty to the later abandon owner.
- [BUG-299 (archived)](../_archive/bugs/bug-299-recovery-panel-external-resolution-stale-state-dead-ends.md) — owns authoritative recovery convergence and capture-then-retire fencing.
- [BUG-291 (archived)](../_archive/bugs/bug-291-session-start-key-rotation-on-timeout-conflict-dead-end.md) — establishes that a possibly committed Start must retain its key.

Found during the 2026-07-16 fix-wave-4 close adversarial review of `ade71553...53ef2e2f`.
