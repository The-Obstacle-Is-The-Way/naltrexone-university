# DEBT-458: Stripe Missing-User Acknowledgement Failures Are Replaced by the Earlier Processing Error

**Status:** Open
**Priority:** P4
**Date:** 2026-07-14
**Confirmed:** 2026-07-14 (fix-wave-3 combined-diff adversarial review; confirmed 3/3 by independent verification panels and reproduced through the production controller with fakes)
**Re-verified accurate against `ddad8eee` on 2026-07-18.**

---

## Description

BUG-296 made a subscription write that fails the exact missing-user FK a handled done-state: the controller rolls back that failed transaction, then marks the Stripe event processed in a fresh acknowledgement transaction. The controller's pre-existing error-preservation flags cross that new phase boundary and select the wrong primary error if acknowledgement itself fails.

The subscription transaction stores its caught `SubscriptionUserMissingError` in `processingError` and sets `hasProcessingError` ([`stripe-webhook-controller.ts#L251-L257`](../../src/adapters/controllers/stripe-webhook-controller.ts#L251-L257)). The missing-user catch then awaits `persistAcknowledgedOutcome` ([lines 262-276](../../src/adapters/controllers/stripe-webhook-controller.ts#L262-L276)). If that separate transaction throws, the outer catch receives the acknowledgement failure as `transactionError` but discards it whenever the stale flag is set:

```ts
const originalError = hasProcessingError
  ? processingError
  : transactionError;
await persistFailure(deps, event, originalError);
throw originalError;
```

([`stripe-webhook-controller.ts#L305-L310`](../../src/adapters/controllers/stripe-webhook-controller.ts#L305-L310))

A fake-boundary reproduction ran the expected three transactions: subscription processing failed missing-user, acknowledgement threw `ack transaction unavailable`, and failure-ledger persistence succeeded. The controller stored and threw `SubscriptionUserMissingError / NOT_FOUND`; the actual acknowledgement failure was absent.

## Impact

The route still returns a retryable 500, Stripe redelivers, and a later healthy acknowledgement can self-heal. No event is falsely acknowledged and no subscription state is corrupted. The harm is operational: the durable `stripe_events.error`, controller throw, and route log all diagnose the already-handled missing-user condition instead of the database/transaction failure that prevented acknowledgement. This can misdirect incident response on the exact recovery path BUG-296 added. P4 is appropriate.

## Root Cause

`processingError` exists to preserve an application error when a transaction wrapper might surface a secondary rollback error from the **same processing attempt**. BUG-296 introduced a second, semantically independent transaction after the missing-user error had been accepted as a terminal business outcome. The mutable error flag was not retired at that phase boundary, so “first processing cause” incorrectly outranks “current acknowledgement failure.”

## Proposed Resolution

1. Make transaction-phase ownership explicit. Once `SubscriptionUserMissingError` has been classified as handled, an acknowledgement failure must become the primary error persisted and thrown. Prefer a small function boundary or typed phase result over adding more global error-precedence branches.
2. Preserve the existing same-transaction primary-error behavior for ordinary subscription writes and non-subscription events; do not regress BUG-285's fresh-transaction failure ledger.
3. Add a controller test with fakes in which the subscription transaction throws missing-user, the acknowledgement transaction fails, and the failure-ledger transaction succeeds. Assert that the acknowledgement error — not `SubscriptionUserMissingError` — is both stored and thrown. Add a retry-success control proving the later delivery still acknowledges normally.

## Relationship to DEBT-452

[DEBT-452](./debt-452-db-failure-observability.md) owns cause-dropping repository wrappers and the safe projection of database diagnostics into logs/ledgers. This finding is earlier in the pipeline: the controller selects the wrong error object before any projector runs. A complete DEBT-452 fix cannot recover an acknowledgement failure that this control flow discarded, so the items should be cross-linked but not merged.

## Related

- [BUG-296 (archived)](../_archive/bugs/bug-296-post-deletion-subscription-webhooks-fail-users-fk.md) — introduced the handled missing-user acknowledgement transaction whose failure exposes this stale-error selection.
- [BUG-285 (archived)](../_archive/bugs/bug-285-stripe-webhook-markfailed-on-aborted-transaction.md) — established fresh-transaction failure persistence and the need to retain the actual primary failure.
- [DEBT-452](./debt-452-db-failure-observability.md) — complementary error-diagnostic projection and logging safety work.

Found during the 2026-07-14 fix-wave-3 close adversarial regression review of `ba457afd...76de5ba3` (independent finder lenses and a 3-verifier panel).
