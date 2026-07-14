# BUG-299: Recovery-Panel Resolutions Outside the Local Abandon-Success Arm Neither Refresh the Panel Nor Retire the Poisoned Start Key

**Status:** Open
**Severity:** P3
**Date:** 2026-07-14
**Confirmed:** 2026-07-14 (wave-2 close adversarial regression review; the family was surfaced by three independent finder lenses and confirmed 3/3 by the verification panels on each leg; re-verified at source in the orchestrating session)
**Component:** Practice / session start / incomplete-session recovery

---

## Summary

[BUG-295](../_archive/bugs/bug-295-preserved-idempotency-keys-replay-across-changed-intent.md)'s start-key retirement is composed exclusively through the **local abandon-success** arm: [`use-practice-session-controls.ts#L50-L57`](<../../app/(app)/app/practice/hooks/use-practice-session-controls.ts#L50-L57>) retires the preserved start key only when `abandonIncompleteSession` resolves `true`, which happens only on a consumed `ok` result ([`practice-page-incomplete-session.ts#L193-L200`](<../../app/(app)/app/practice/practice-page-incomplete-session.ts#L193-L200>)). Every other way the recovery session can be resolved leaves stale client state behind:

1. **Terminal-conflict abandon (stale panel dead-end):** when abandon fails with the cached terminal lifecycle conflicts (`already_ended` / `exam_time_expired`), the client rotates the abandon key and shows an error but never refreshes or clears the recovery panel ([`practice-page-incomplete-session.ts#L181-L190`](<../../app/(app)/app/practice/practice-page-incomplete-session.ts#L181-L190>)). Those conflicts mean the session **is already over** — resolution has happened — yet the panel keeps offering Resume/Abandon for it, every retry re-executes under a fresh key into the same conflict, and the preserved start key is never retired. Escapable only by full page reload (or a config change, which rotates the start key as a side effect).
2. **External resolution (poisoned key against an empty panel):** if the surfaced incomplete session is resumed and finished in another tab, a preserved start key holding a cached indeterminate `INTERNAL_ERROR` (the `cache-error-and-throw` arm: session committed, outcome store failed — [`practice-page-session-start.ts#L133`](<../../app/(app)/app/practice/practice-page-session-start.ts#L133>)) replays on every Start click, while the refresh-on-failure now finds nothing to recover ([`use-practice-session-start.ts#L73`](<../../app/(app)/app/practice/hooks/use-practice-session-start.ts#L73>) exposes retirement, but no caller fires it on this path). The user faces a repeating error with no panel and nothing left to abandon — BUG-291's dead-end shape, reached through external resolution instead of the local abandon flow.

## Reachability

Leg 1 needs the recovery session to end between panel load and the abandon click — a second tab, exam-timer expiry, or the abandon racing a finalize; the lifecycle policy then serves the typed terminal conflict. Leg 2 needs the `cache-error-and-throw` start arm (or a lost-response committed start) followed by cross-tab resolution — multi-tab practice is an established pattern in this register (BUG-282's two-tab loop). Both are same-mount states with no privileged preconditions.

## Reproduction (leg 1)

1. Start fails indeterminately; the refresh surfaces session A's Resume/Abandon panel; the start key S is preserved (correct).
2. In another tab, A is resumed and ended (or A's exam timer expires and a navigation finalizes it).
3. Back on the first tab, the user clicks Abandon. The lifecycle policy returns the cached terminal `already_ended` CONFLICT; the client rotates the abandon key, shows the error — and leaves the panel rendered and S preserved.
4. Every further Abandon re-executes to the same conflict; every Start replays S's cached outcome.

Expected: a terminal lifecycle conflict is proof of resolution — refresh the incomplete-session state (clearing the panel) and retire the preserved start key, exactly as the local abandon-success arm does.

Actual: stale panel + poisoned start key until reload.

## Root Cause

Resolution events were modeled as "my abandon succeeded" instead of "the recovery session is no longer recoverable." The terminal-conflict arm already knows the session ended (that is what `already_ended`/`exam_time_expired` mean) but performs no state convergence; the external-resolution case has no detection point at all beyond the existing refresh-on-start-failure, which updates the panel but not the key.

## Impact

Same-mount dead-ends on the practice-start surface the wave was hardening: a stale recovery panel that cannot be dismissed and a Start button that replays a cached error against an empty panel. No data loss — the sessions are correctly ended server-side — and reload recovers. P3, matching BUG-291/295 grades for this dead-end class.

## Proposed Fix

1. **RECOMMENDED:** treat cached terminal lifecycle conflicts on abandon as consumed resolutions: refresh the incomplete-session state (which clears the panel when the session is gone) **and** report resolution to the controls layer so it retires the preserved start key — i.e. widen `abandonIncompleteSession`'s boolean into "resolved" semantics (`ok` success or terminal conflict) while keeping indeterminate/transient failures `false`.
2. Retire the preserved start key whenever a failed start's refresh finds **no** incomplete session: with nothing left to recover, replaying the cached error is never useful, and re-execution under a fresh key is the only path forward. (This also covers leg 2's variant where the cached outcome is a success for a session ended elsewhere: re-execution correctly starts a new session.)
3. Pin both sequences in the browser suite: terminal-conflict abandon → panel cleared → new-key Start succeeds; and external-resolution → Start retries under a fresh key.

## Related

- [BUG-295 (archived)](../_archive/bugs/bug-295-preserved-idempotency-keys-replay-across-changed-intent.md) — introduced retirement through the local abandon-success arm; its Resolution notes this residual family.
- [BUG-291 (archived)](../_archive/bugs/bug-291-session-start-key-rotation-on-timeout-conflict-dead-end.md) — the original dead-end class; its recovery-panel refresh is the mechanism leg 2 shows is necessary but not sufficient.
- [BUG-282 (archived)](../_archive/bugs/bug-282-tutor-two-tab-ended-session-dead-end-loop.md) — precedent that two-tab practice interleavings are register-grade reachable.
- [DEBT-456](../debt/debt-456-client-conflict-reason-discrimination-gaps.md) — the targeted-arm pattern the terminal-conflict handling should follow.

Found during the 2026-07-14 wave-2 close adversarial regression review (8 finder lenses, 3-verifier panels per candidate).
