# BUG-299: Recovery-Panel Resolutions Outside the Local Abandon-Success Arm Neither Refresh the Panel Nor Retire the Poisoned Start Key

**Status:** Open
**Severity:** P3
**Date:** 2026-07-14
**Confirmed:** 2026-07-14 (wave-2 close adversarial regression review; the family was surfaced by three independent finder lenses and confirmed 3/3 by the verification panels on each leg; re-verified at source in the orchestrating session)
**Component:** Practice / session start / incomplete-session recovery

---

## Summary

[BUG-295](../_archive/bugs/bug-295-preserved-idempotency-keys-replay-across-changed-intent.md)'s start-key retirement is composed exclusively through the **local abandon-success** arm: [`use-practice-session-controls.ts#L50-L57`](<../../app/(app)/app/practice/hooks/use-practice-session-controls.ts#L50-L57>) retires the preserved start key only when `abandonIncompleteSession` resolves `true`, which happens only on a consumed `ok` result ([`practice-page-incomplete-session.ts#L193-L200`](<../../app/(app)/app/practice/practice-page-incomplete-session.ts#L193-L200>)). Every other way the recovery session can be resolved leaves stale client state behind:

1. **Externally-ended tutor abandon (stale panel dead-end):** when a tutor session ends after the recovery panel loads, abandon returns the bare, no-reason `CONFLICT('Practice session already ended')` emitted by [`end-practice-session.ts`](../../src/application/use-cases/end-practice-session.ts) or the repository's concurrent-race arm in [`drizzle-practice-session-repository.ts`](../../src/adapters/repositories/drizzle-practice-session-repository.ts). The client's typed-terminal predicate does not match that response, so it shows an error without refreshing or clearing the recovery panel ([`practice-page-incomplete-session.ts`](<../../app/(app)/app/practice/practice-page-incomplete-session.ts>)). The panel keeps offering Resume/Abandon for an ended session and the preserved start key is never retired. The `already_ended` / `exam_time_expired` predicate is dead code on this abandon surface: `exam_time_expired` is emitted only by [`save-exam-draft-answer.ts`](../../src/application/use-cases/save-exam-draft-answer.ts), while exam discard is idempotent and already self-heals when its session is absent or externally finalized.
2. **External resolution (poisoned key against an empty panel):** if the surfaced incomplete session is resumed and finished in another tab, a preserved start key holding a cached indeterminate `INTERNAL_ERROR` (the `cache-error-and-throw` arm: session committed, outcome store failed — [`practice-page-session-start.ts#L133`](<../../app/(app)/app/practice/practice-page-session-start.ts#L133>)) replays on every Start click, while the refresh-on-failure now finds nothing to recover ([`use-practice-session-start.ts#L73`](<../../app/(app)/app/practice/hooks/use-practice-session-start.ts#L73>) exposes retirement, but no caller fires it on this path). The user faces a repeating error with no panel and nothing left to abandon — BUG-291's dead-end shape, reached through external resolution instead of the local abandon flow.

## Reachability

Leg 1 needs a tutor recovery session to end between panel load and the abandon click — for example, in a second tab or by racing another tutor `end()` call. The abandon then receives the bare conflict and leaves the local panel stale. The exam variant is a control rather than a bug: discard treats an absent session as success and deletes an externally finalized exam session, so its existing success arm clears the panel and retires the start key. Leg 2 needs the `cache-error-and-throw` start arm (or a lost-response committed start) followed by cross-tab resolution — multi-tab practice is an established pattern in this register (BUG-282's two-tab loop). Both buggy legs are same-mount states with no privileged preconditions.

## Reproduction (leg 1)

1. Start fails indeterminately; the refresh surfaces session A's Resume/Abandon panel; the start key S is preserved (correct).
2. In another tab, tutor session A is resumed and ended.
3. Back on the first tab, the user clicks Abandon. The server returns the bare `CONFLICT('Practice session already ended')`; the client shows the error but neither refetches the authoritative incomplete-session state nor clears the panel, and S remains preserved.
4. Every further Abandon re-executes to the same bare conflict; every Start replays S's cached outcome.

Expected: every failed abandon refetches authoritative incomplete-session state. Only a successful refresh that proves no incomplete session remains clears the panel and retires the preserved start key; an abandon timeout or failed refresh preserves both state and key.

Actual: stale panel + poisoned start key until reload.

## Root Cause

Resolution events were modeled as "my abandon succeeded" instead of an authoritative observation that "no incomplete session remains." A failed abandon performs no state convergence, while the existing refresh-on-start-failure updates the panel but returns no typed outcome with which its owner can safely retire the poisoned start key. A bare conflict cannot itself prove which authoritative state should render, and a failed refresh cannot prove resolution.

## Impact

Same-mount dead-ends on the practice-start surface the wave was hardening: a stale recovery panel that cannot be dismissed and a Start button that replays a cached error against an empty panel. No data loss — the sessions are correctly ended server-side — and reload recovers. P3, matching BUG-291/295 grades for this dead-end class.

## Proposed Fix

1. **RECOMMENDED:** after every non-successful abandon result — including the bare tutor conflict — refetch the authoritative incomplete-session state and return a typed refresh outcome. Render only from the refreshed state; do not infer lifecycle resolution from a conflict code, reason, or message.
2. Retire the preserved start key only when a successful refresh proves that no incomplete session remains. Preserve the key and existing panel on abandon timeouts and refresh failures so same-key retry remains possible under BUG-291's determinacy rule.
3. Use that same proven-absence outcome after failed starts so resolution in a second tab clears the stale panel and retires the poisoned key. Extend the existing refresh seam rather than creating a second lifecycle path.
4. Pin the tutor bare-conflict, indeterminate abandon, refresh-failure, second-tab resolution, and exam-discard self-heal control sequences. Do not add typed reasons to the tutor end arms; that thrown-arm work remains DEBT-457 Item 1.

## Resolution State

- **Branch:** `fix/bug-299-recovery-panel-external-resolution`
- **Approach:** implemented an explicit `IncompleteSessionRefreshOutcome` owned by the incomplete-session hook. Every failed abandon now converges through that existing refresh seam, and only an authoritative successful `null` observation signals the controls/start-key owner to retire the preserved key. Failed, superseded, and still-present outcomes preserve the key and last authoritative panel. Start-result recovery uses the same absence proof and refuses stale-request or already-rotated double retirement. Awaited abandon recovery captures an owner-provided retirement fence so it cannot retire a newer start intent.
- **Tests:** red-first unit failures pinned the missing typed outcome and missing start-key retirement; four red Chromium sequences pinned the tutor bare-conflict dead-end, timeout preservation, refresh-failure containment, and second-tab resolution. The exam-discard self-heal remained green as the control. Follow-up race assertions cover superseded reads, determinate-error single rotation, a newer intent arriving during refresh, and an in-flight start overlapping resolved abandon recovery (red as a permanently `loading` start before the retirement fence).
- **Delivery:** [PR #652](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/652) carries the implementation. Status stays Open until wave-close archival records post-promotion production proof.

## Related

- [BUG-295 (archived)](../_archive/bugs/bug-295-preserved-idempotency-keys-replay-across-changed-intent.md) — introduced retirement through the local abandon-success arm; its Resolution notes this residual family.
- [BUG-291 (archived)](../_archive/bugs/bug-291-session-start-key-rotation-on-timeout-conflict-dead-end.md) — the original dead-end class; its recovery-panel refresh is the mechanism leg 2 shows is necessary but not sufficient.
- [BUG-282 (archived)](../_archive/bugs/bug-282-tutor-two-tab-ended-session-dead-end-loop.md) — precedent that two-tab practice interleavings are register-grade reachable.
- [DEBT-456](../debt/debt-456-client-conflict-reason-discrimination-gaps.md) — the targeted-arm pattern the terminal-conflict handling should follow.

Found during the 2026-07-14 wave-2 close adversarial regression review (8 finder lenses, 3-verifier panels per candidate).
