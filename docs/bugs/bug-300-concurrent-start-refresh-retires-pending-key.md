# BUG-300: Concurrent Start Refresh Can Retire the Only Key for a Still-Running Request

**Status:** Open
**Severity:** P4
**Date:** 2026-07-14
**Confirmed:** 2026-07-14 (fix-wave-3 combined-diff adversarial review; confirmed 3/3 by independent verification panels and reproduced through the production `startSession` helper)
**Component:** Practice / session start / idempotency-key lifecycle

---

## Summary

BUG-299 correctly refreshes incomplete-session state after every non-successful Start result and retires a preserved start key when an authoritative refresh proves that no incomplete session remains. The proof is too broad for one indeterminate result: `ConcurrentRequestInProgress` means that the original same-key request **may still be executing**, so a point-in-time read that returns no committed session cannot prove that the request will not commit after the read.

[`startSession`](<../../app/(app)/app/practice/practice-page-session-start.ts#L136-L160>) first leaves `ConcurrentRequestInProgress` unrotated under the determinacy policy, then immediately rotates it when `refreshIncompleteSession()` returns `{ kind: 'loaded', session: null }`. The wrapper's own contract says that this result means the concurrent request “may still be in progress or may have failed” ([`with-idempotency.ts#L348-L362`](../../src/adapters/shared/with-idempotency.ts#L348-L362)). The refresh therefore turns “not committed yet” into “cannot commit,” discarding the only replay handle to a request that can still create the session.

## Reachability

The production timing budgets make the interleaving concrete:

- the client mutation timeout is 15 seconds ([`timeout-tiers.ts`](<../../app/(app)/app/shared/timeout-tiers.ts>));
- the app route budget is 30 seconds ([`layout.tsx#L18-L20`](<../../app/(app)/app/layout.tsx#L18-L20>));
- `withIdempotency` waits only 2 seconds for another same-key claim before returning `ConcurrentRequestInProgress` ([`with-idempotency.ts#L16-L18`](../../src/adapters/shared/with-idempotency.ts#L16-L18)); and
- the production hook always supplies the refresh callback ([`use-practice-session-start.ts#L145-L167`](<../../app/(app)/app/practice/hooks/use-practice-session-start.ts#L145-L167>)).

The client's timeout is a `Promise.race` and does not cancel the server request. After the 15-second timeout, Start is enabled again. A same-key retry can receive the concurrent result around second 17, refresh before the original transaction commits, observe no row, and rotate the key while the original still has time to finish.

## Reproduction

1. Start request A runs longer than the 15-second client timeout under key K1 but remains live server-side.
2. The user retries Start with K1. The wrapper waits 2 seconds and returns typed `ConcurrentRequestInProgress`.
3. The immediate incomplete-session refresh reads before A commits and returns a successful `null` observation.
4. `startSession` replaces K1 with K2.
5. A commits after the refresh. K1 is now the completed request's only replay handle, but the client has discarded it.
6. A later K2 Start executes fresh and reaches the incomplete-session conflict before the same failed-result refresh surfaces A's recovery panel.

A direct call to the production helper with the concurrent result plus a loaded-null refresh produced `retiredTo: ['K_FRESH']`. The existing test named “preserves the key when a concurrent same-key request may still finish” omits the production refresh callback ([`practice-page-logic-session-start.test.ts#L214-L234`](<../../app/(app)/app/practice/practice-page-logic-session-start.test.ts#L214-L234>)), so it passes without exercising the faulty composition.

Expected: preserve K1 while a same-key request may still commit; refresh may update the panel, but point-in-time absence cannot retire the key.

Actual: loaded-null refresh rotates K1 and forces a fresh execution/conflict/recovery round trip.

## Impact

This violates BUG-291's determinacy rule and loses the handle to a possibly committed result. The database's single-incomplete-session constraint still prevents duplicate live sessions, and BUG-299's refresh-on-failure path should surface the committed session after the next fresh-key conflict. The confirmed impact is therefore an avoidable error/recovery round trip and lost replay, not corruption or the old reload-only dead end. P4 is appropriate.

## Root Cause

The refresh outcome models authoritative state **at the read snapshot**, but key retirement also needs proof that no operation capable of changing that state remains in flight. BUG-299 composed state convergence and idempotency-key retirement under one loaded-null predicate without preserving the wrapper's concurrent-claim uncertainty.

## Proposed Fix

1. Keep the authoritative refresh after `ConcurrentRequestInProgress` so the panel can converge if the original already committed, but explicitly forbid key retirement for that reason. Discriminate by the typed `details.reason`; never match message text.
2. Preserve the existing loaded-null retirement for completed outcomes whose possibly committed session has since been resolved elsewhere; do not regress BUG-299's second-tab recovery.
3. Add a production-shaped unit test that supplies the refresh callback to the concurrent-result case and asserts K1 is preserved, plus a browser sequence covering client timeout → same-key concurrent result → pre-commit null refresh → late original completion → same-key recovery.

## Resolution State

- **Approach:** Added a shared controller-boundary predicate that recognizes only `CONFLICT` plus `ApplicationConflictReasons.ConcurrentRequestInProgress`. The practice start flow still performs its authoritative refresh after every failed result, but a loaded-null refresh can retire the key only when that exact concurrent outcome is absent. Determinate rotation and every other loaded-null retirement path remain unchanged; the server idempotency wrapper is untouched.
- **Tests:** Upgraded the production-shaped session-start unit case to cover typed concurrent failure plus loaded-null refresh, retained controls for determinate single rotation and non-concurrent loaded-null retirement, added concurrent live-session convergence coverage, asserted the shared predicate against correct and wrong shapes, and added a Vitest Browser sequence covering timeout → same-key concurrent retry → pre-commit null refresh → late commit → same-key recovery into the Resume/Abandon panel.
- **Branch:** `fix/bug-300-concurrent-start-retirement-guard`

Status remains **Open** pending wave-close archival with production proof.

## Related

- [BUG-291 (archived)](../_archive/bugs/bug-291-session-start-key-rotation-on-timeout-conflict-dead-end.md) — established that `ConcurrentRequestInProgress` is indeterminate and must preserve the start key.
- [BUG-299 (archived)](../_archive/bugs/bug-299-recovery-panel-external-resolution-stale-state-dead-ends.md) — introduced the over-broad absence-based retirement while correctly closing the external-resolution dead ends.
- [BUG-295 (archived)](../_archive/bugs/bug-295-preserved-idempotency-keys-replay-across-changed-intent.md) — register law for preserving the only handle to a possibly committed result and retiring it only after consumption.

Found during the 2026-07-14 fix-wave-3 close adversarial regression review of `ba457afd...76de5ba3` (independent finder lenses and a 3-verifier panel).
