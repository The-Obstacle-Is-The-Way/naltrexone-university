# BUG-303: Abandoning a Refreshed Session Can Retire the Key for a Different Still-Running Start

**Status:** Resolved
**Severity:** P4
**Date:** 2026-07-16
**Confirmed:** 2026-07-16 (fix-wave-4 combined-diff adversarial review; confirmed 3/3 by client-owner tracing, a production-hook Chromium reproduction, and the server write-order verifier)
**Component:** Practice / session start / recovery-panel key retirement

---

## Summary

BUG-300 correctly prevents the immediate loaded-null refresh inside `startSession` from retiring a key after `ConcurrentRequestInProgress`. That uncertainty is local to the one helper invocation. It is not carried to BUG-299's later capture-then-retire owner: [`captureIdempotencyKeyRetirement`](<../../../app/(app)/app/practice/hooks/use-practice-session-start.ts>) remembers only the key value, and [`use-practice-session-controls.ts`](<../../../app/(app)/app/practice/hooks/use-practice-session-controls.ts>) retires it after any successful recovery-panel abandon.

A refreshed incomplete session is not proven to be the effect of the still-running same-key request. The server's [`StartPracticeSessionUseCase`](../../../src/application/use-cases/start-practice-session.ts) performs `findLatestIncompleteByUserId`, then lists/shuffles candidate questions, and only later calls `sessions.create`. A different tab can create session S during that gap. The concurrent retry can refresh S; if the user abandons S before the original request reaches `create`, the original request can then create a different session T under the preserved key K. The abandon path has already replaced K, losing the only replay handle to T.

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

## Resolution

Resolved and production-verified on 2026-07-18. Initial fix PR
[#664](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/664)
received CodeRabbit formal APPROVED on exact head `5bb9fcc9` and squash-merged
as `27621e37`. Five promotion-review hardening rounds then made the final
ownership model explicit and coherent:

1. PR [#666](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/666)
   replaced key-wide settlement with per-invocation claims (APPROVED exact head
   `6761c676`, squash `7cc09e91`).
2. PR [#667](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/667)
   added production-continuation test barriers (APPROVED exact head `618b299c`,
   squash `9f8b83db`).
3. PR [#668](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/668)
   fenced null-refresh retirement through the owner gate (APPROVED exact head
   `eb32f0c5`, squash `aadc4c96`).
4. PR [#669](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/669)
   fixed reverse-order claim settlement (APPROVED exact head `4a4df243`, squash
   `e9e6d1c4`).
5. PR [#671](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/671)
   stabilized the final browser continuation proofs (APPROVED exact head
   `364dc8f4`, squash `1343c3d1`).

Documentation corrections also received exact-head formal approval: PR
[#670](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/670)
(`402846ff` → `f6b3aecd`) and PR
[#672](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/672)
(`45aa2c9f` → `ddad8eee`).

- `usePracticeSessionStart` now owns per-key concurrent-execution uncertainty.
  Each accepted Start invocation receives an opaque claim identity and enters
  the key's unsettled-claim set before awaiting the controller. A returned
  non-concurrent result settles only its reporting claim: client launch order
  never stands in for server acquisition order. A typed
  `concurrent_request_in_progress` result releases its reporting claim and
  raises a versioned uncertainty generation. Only a same-key invocation
  launched after observing that exact generation may consume it; an
  already-running invocation cannot clear a later server observation merely
  because its response arrives later. A handler captured by an obsolete render
  is rejected before it can submit stale intent or mutate the current request
  state. Thrown transport and timeout outcomes release their local claim by
  raising a new uncertainty generation; the key remains preserved until a
  causally later same-key result consumes that generation.
- `captureIdempotencyKeyRetirement` still rejects a superseded captured key and
  now also rejects a captured key whose same-key execution may still commit.
  Authoritative incomplete-session refresh continues to own panel convergence,
  but the per-user session it returns is never treated as request identity.
- The first promotion follow-up replaced key-wide settlement with ordered
  per-invocation claims. A later full review then exposed the remaining inline
  bypass: an earlier `INTERNAL_ERROR` followed by authoritative absence could
  still rotate directly inside `startSession` while a later same-key claim was
  unsettled. On `fix/bug-303-null-refresh-claim-fence`, proven-absence
  retirement now goes through a required owner-issued retirement gate captured
  after the invocation claims the key. The helper retains request-local error
  classification, while the hook remains the sole owner of key-wide retirement
  eligibility.
- Red-first Chromium proof reproduced the defect through the production
  `usePracticeSessionControls` hook: typed concurrent result → refresh renders
  session S → successful abandon S → next Start carried a fresh UUID instead of
  the preserved key. The green suite proves same-key reuse, thrown/timeout
  preservation across unrelated-session abandon, claim-scoped settlement,
  preservation while a later same-key invocation remains unresolved,
  preservation when an earlier `INTERNAL_ERROR` refresh proves absence while a
  later same-key invocation remains unresolved, preservation when a
  later-launched claim settles before an earlier invocation reaches the server,
  conservative handling when a concurrent observation arrives after a
  pre-existing result, causal consumption by a retry launched after observed
  uncertainty, and zero controller/UI effects from a stale render's handler.
  Existing controls remain green for ordinary abandon retirement, second-tab
  proven-absence retirement, BUG-300's immediate-refresh guard, and BUG-291's
  thrown-outcome preservation. The claim-order scenarios live in a focused
  browser spec, and both browser specs remain below the repository's 800-line
  test-file warning after the completion-barrier hardening in PR
  [#671](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/671).
- A use-case orchestration test inserts and ends another tab's session during
  candidate selection—after the initial incomplete-session precheck and before
  the original `sessions.create`—then proves the original request can create its
  distinct session. This pins why session S cannot identify request A.
- Each implementation head passed the full local gate before push. Promotion PR
  [#665](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/665)
  received CodeRabbit formal APPROVED review `4728788574` on its exact final
  head `ddad8eee` and merged to `main` as `fd2e6fc8`. Fresh terminal-close proof
  found main and dev byte-identical at tree `3964a0e8`; main CI run
  [29652695750](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/29652695750)
  succeeded through unit, integration, browser, build, E2E, and deploy, and
  `https://addictionboards.com/` returned HTTP 200.

## Related

- [BUG-300 (archived)](./bug-300-concurrent-start-refresh-retires-pending-key.md) — fixes immediate refresh retirement but does not propagate uncertainty to the later abandon owner.
- [BUG-299 (archived)](./bug-299-recovery-panel-external-resolution-stale-state-dead-ends.md) — owns authoritative recovery convergence and capture-then-retire fencing.
- [BUG-291 (archived)](./bug-291-session-start-key-rotation-on-timeout-conflict-dead-end.md) — establishes that a possibly committed Start must retain its key.

Found during the 2026-07-16 fix-wave-4 close adversarial review of `ade71553...53ef2e2f`.
