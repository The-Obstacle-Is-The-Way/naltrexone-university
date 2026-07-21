# DEBT-457: Wave-2 Residues — End-Session Thrown-Arm Key Rotation, Version-Fence Double Stripe Retrieve, and a Vacuous Fake Snapshot/Restore Test

**Status:** Open
**Priority:** P4
**Date:** 2026-07-14
**Component:** Practice end/finalize client, Stripe webhook version fence, subscription fake test
**Re-verified accurate against `ddad8eee` on 2026-07-18.**

---

## Direction (2026-07-21 forest review)

| Part | Verdict | Chosen option | Rejected as disproportionate | One-line rationale |
| --- | --- | --- | --- | --- |
| 1. End-session thrown-arm determinacy | **FIX (minimal mirrored form)** | Mirror `practice-page-session-start.ts`: preserve the existing end/finalize key on every thrown transport/timeout outcome, and rotate only after a returned determinate error under the existing policy. Pin timeout/throw preservation plus returned-error rotation. | ACCEPTing the lost replay/extra round-trip; a new general client idempotency state machine or cross-page lifecycle abstraction. | (a) Reuses the shipped determinacy branch; (b) the non-cancelling timeout window is mechanically reachable; (c) Blast radius: a committed end loses its replay handle and needs an extra recovery request. Fix cost: remove/guard one rotation and add focused tests; (d) aligns sibling semantics; (e) makes the campaign's determinacy law uniform. |
| 2. First-attempt Stripe re-retrieve cost | **ACCEPT (documented fresh-observation design)** | Keep the initial discovery parse/retrieve plus one fresh Stripe observation after the local version read on the first CAS attempt, and another fresh observation for each retry. Revive only if Stripe telemetry records a `429`/rate-limit error attributable to subscription-webhook retrieves, or sampled Sentry webhook spans show p95 at or above 3 seconds for 7 consecutive days with Stripe retrieve dominant. | Moving the version read ahead of the hardened initial parse, reusing a pre-version observation, or redesigning the CAS fence for an unmeasured API-cost concern. | (a) Adds no mechanism; (b) the double call is proven but cost pressure is unmeasured; (c) Blast radius: every subscription webhook consumes one extra Stripe request and its latency. Cure cost: reordering a hardened identity/version fence is correctness-sensitive and scarier; (d) documents the intentional contract instead of hiding it; (e) preserves fresh-observation-per-attempt determinacy. Accepted failure: every subscription webhook performs at least two Stripe API observations even when its first CAS write succeeds. |
| 3. Snapshot/restore proof | **FIX (minimal production-shaped test)** | Make the pre-restore write guard-passing, assert rows and `observationVersionByUserId` changed before restore, then assert both return to the snapshot afterward. | Keeping the post-restore-only test; direct private-map mutation or a broader fake transaction framework. | (a) Changes only one test; (b) the existing mutation is vacuous under the real guard; (c) Blast radius: a broken restore can make rollback-aware controller tests certify impossible state. Fix cost: production-shaped setup and before/after assertions; (d) satisfies fake-fidelity/LSP law; (e) matches DEBT-455 and DEBT-451.4. |

Determinacy is consistent across start and end: thrown transport/timeout outcomes preserve their replay key, while only returned determinate errors rotate under the existing action policy. The Stripe version fence deliberately pays for a fresh observation after the local version read; its unmeasured request cost is accepted rather than traded for correctness-sensitive reordering. Fake snapshot tests must demonstrate the mutation before claiming restore semantics.

## Context

Filed from the 2026-07-14 wave-2 close adversarial regression review (8 finder lenses over the combined diff `318549f5...cde6ccd8`, 3-verifier panels per candidate). Three P4 residues that are real but below bug-grade impact; grouped here so the close leaves no verified finding unanchored.

## Item 1 — `endSession` rotates its key on the indeterminate thrown arm

[`practice-session-page-logic.ts#L238-L262`](<../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts#L238-L262>) rotates the finalize/end idempotency key inside the generic `catch` — including client-timeout throws whose server outcome is unknown. This is the exact determinacy-rule violation BUG-291 fixed on the start surface (preserve across indeterminate outcomes; the key is the only handle to a possibly-committed result), left in place on end/finalize. Consequence is bounded, which is why this is debt rather than a bug: a blind re-execution after a committed end converges through the typed `AlreadyEnded` handling instead of replaying the stored summary — an extra round-trip and a lost replay, not a wrong outcome. BUG-290's archived doc recorded this rotation approvingly under the pre-wave doctrine; under the post-#640 doctrine it is a residual inconsistency. **CHOSEN, minimal form:** preserve the key on the thrown arm exactly as `practice-page-session-start.ts` does; rotate only after a returned determinate error. The dissenting ACCEPT is rejected because it would contradict the campaign determinacy law.

## Item 2 — Version-fence webhook path performs a live Stripe retrieve per CAS attempt, including the first

The BUG-287 fix's webhook integration re-runs `processWebhookEvent` — which performs a live `stripe.subscriptions.retrieve` via the BUG-242 re-fetch design — as the CAS loop's `retrieve()` on **every** attempt, including attempt 1, even though the controller already parsed and re-fetched the event once to discover the user id ([`stripe-webhook-controller.ts#L139-L183`](../../src/adapters/controllers/stripe-webhook-controller.ts#L139-L183)). Every subscription webhook therefore costs at least two Stripe API round-trips. The fresh-observation-per-attempt design is deliberate (each CAS attempt must pair its version read with a fresh retrieve), but the doubled steady-state API cost was not previously recorded as accepted. **ACCEPTED:** keep the hardened order and fresh observation per CAS attempt; do not move the version read ahead of the initial parse for an unmeasured cost. Accepted failure: every subscription webhook performs at least two Stripe API observations even when attempt 1 persists. Revive through a new direction ruling only after the table's Stripe-rate-limit or sampled-Sentry trigger fires.

## Item 3 — `FakeSubscriptionRepository.snapshot()/restore()` test is vacuous

The only unit test of the fake's snapshot/restore pair ([`fake-subscription-repository.test.ts#L290`](../../src/application/test-helpers/fakes/fake-subscription-repository.test.ts#L290)) performs its pre-restore mutation through `upsert`, which the fake's write guard silently rejects under the default real clock — so the post-restore assertions pass even if `restore()` is a no-op. The wave-2 `observationVersionByUserId` state added to the fake is therefore untested on the restore path. **CHOSEN, minimal form:** make the mutation guard-passing through the public fake contract, assert it took effect **before** restoring, then assert restore reverted both rows and observation versions. Direct private-state manipulation and a broader fake transaction framework are rejected. Same fake-fidelity family as [DEBT-455](./debt-455-fake-user-repository-fidelity-divergences.md).

## Verification

- **Part 1:** focused end-session tests prove a timeout/thrown transport error does not rotate the key, a returned determinate failure still follows the existing rotation policy, and success still consumes the result normally.
- **Part 2:** source/contract coverage pins the order as initial discovery → local version read → fresh observation → CAS persist, with each version-conflict retry reading the new version before another fresh observation. No performance rewrite is part of this fix campaign.
- **Part 3:** the test first asserts the replacement subscription and observation version were committed, then restores and asserts both the original row/mapping and original observation version return. A temporary no-op `restore()` must make the test fail.

## Related

- [BUG-297 (archived)](../_archive/bugs/bug-297-checkout-success-version-cas-exhaustion-uncaught-conflict.md) — the same version-fence seam's user-facing exhaustion leg (bug-grade, fixed and production-verified).
- [BUG-291 (archived)](../_archive/bugs/bug-291-session-start-key-rotation-on-timeout-conflict-dead-end.md) — the determinacy rule Item 1 completes.
- [DEBT-455](./debt-455-fake-user-repository-fidelity-divergences.md) — fake-fidelity precedent for Item 3.
