# DEBT-457: Wave-2 Residues — End-Session Thrown-Arm Key Rotation, Version-Fence Double Stripe Retrieve, and a Vacuous Fake Snapshot/Restore Test

**Status:** Open
**Priority:** P4
**Date:** 2026-07-14
**Component:** Practice end/finalize client, Stripe webhook version fence, subscription fake test

---

## Context

Filed from the 2026-07-14 wave-2 close adversarial regression review (8 finder lenses over the combined diff `318549f5...cde6ccd8`, 3-verifier panels per candidate). Three P4 residues that are real but below bug-grade impact; grouped here so the close leaves no verified finding unanchored.

## Item 1 — `endSession` rotates its key on the indeterminate thrown arm

[`practice-session-page-logic.ts#L221-L232`](<../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts#L221-L232>) rotates the finalize/end idempotency key inside the generic `catch` — including client-timeout throws whose server outcome is unknown. This is the exact determinacy-rule violation BUG-291 fixed on the start surface (preserve across indeterminate outcomes; the key is the only handle to a possibly-committed result), left in place on end/finalize. Consequence is bounded, which is why this is debt rather than a bug: a blind re-execution after a committed end converges through the typed `AlreadyEnded` handling instead of replaying the stored summary — an extra round-trip and a lost replay, not a wrong outcome. BUG-290's archived doc recorded this rotation approvingly under the pre-wave doctrine; under the post-#640 doctrine it is a residual inconsistency. Fix: branch the thrown arm on determinacy exactly as `practice-page-session-start.ts` now does (verifier vote 2/3 — the reachability dissent argued the convergence makes it cosmetic; recorded honestly here).

## Item 2 — Version-fence webhook path performs a live Stripe retrieve per CAS attempt, including the first

The BUG-287 fix's webhook integration re-runs `processWebhookEvent` — which performs a live `stripe.subscriptions.retrieve` via the BUG-242 re-fetch design — as the CAS loop's `retrieve()` on **every** attempt, including attempt 1, even though the controller already parsed and re-fetched the event once to discover the user id ([`stripe-webhook-controller.ts#L156-L176`](../../src/adapters/controllers/stripe-webhook-controller.ts#L156-L176)). Every subscription webhook therefore costs at least two Stripe API round-trips. The fresh-observation-per-attempt design is deliberate (each CAS attempt must pair its version read with a fresh retrieve), but the doubled steady-state API cost was not recorded anywhere as accepted. Options if it ever matters: reuse the initial parse as attempt 1's observation by reading the version **before** the initial parse, or accept and document the cost here. Verifier panel flagged this as partially documented (the mechanism is described in BUG-287's fix records; the cost is not) — this item is the cost's register anchor.

## Item 3 — `FakeSubscriptionRepository.snapshot()/restore()` test is vacuous

The only unit test of the fake's snapshot/restore pair ([`fake-subscription-repository.test.ts#L250`](../../src/application/test-helpers/fakes/fake-subscription-repository.test.ts#L250)) performs its pre-restore mutation through `upsert`, which the fake's write guard silently rejects under the default real clock — so the post-restore assertions pass even if `restore()` is a no-op. The wave-2 `observationVersionByUserId` state added to the fake is therefore untested on the restore path. Fix: make the mutation guard-passing (fresher period end or direct state manipulation), assert the mutation took effect **before** restoring, then assert restore reverted both rows and observation versions. Same fake-fidelity family as [DEBT-455](./debt-455-fake-user-repository-fidelity-divergences.md).

## Related

- [BUG-297 (archived)](../_archive/bugs/bug-297-checkout-success-version-cas-exhaustion-uncaught-conflict.md) — the same version-fence seam's user-facing exhaustion leg (bug-grade, fixed and production-verified).
- [BUG-291 (archived)](../_archive/bugs/bug-291-session-start-key-rotation-on-timeout-conflict-dead-end.md) — the determinacy rule Item 1 completes.
- [DEBT-455](./debt-455-fake-user-repository-fidelity-divergences.md) — fake-fidelity precedent for Item 3.
