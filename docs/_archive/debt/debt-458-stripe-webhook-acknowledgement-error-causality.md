# DEBT-458: Stripe Missing-User Acknowledgement Failures Are Replaced by the Earlier Processing Error

**Status:** Resolved
**Priority:** P4
**Date:** 2026-07-14
**Confirmed:** 2026-07-14 (fix-wave-3 combined-diff adversarial review; confirmed 3/3 by independent verification panels and reproduced through the production controller with fakes)
**Re-verified accurate against `ddad8eee` on 2026-07-18.**
**Resolved:** 2026-07-21 — FW-2 extracted the subscription processing phase so its same-transaction primary-error selection ends before the handled missing-user acknowledgement transaction. An acknowledgement failure is now persisted and thrown as primary; a later healthy delivery acknowledges normally, while ordinary processing precedence and fresh failure-ledger persistence remain unchanged.

---

## Direction (2026-07-21 forest review)

| Part | Verdict | Chosen option | Rejected as disproportionate | One-line rationale |
| --- | --- | --- | --- | --- |
| 1. Missing-user acknowledgement causality | **FIX (minimal phase-owned form)** | Introduce one small function boundary or typed phase result that ends processing-error ownership when `SubscriptionUserMissingError` is classified handled; if the fresh acknowledgement transaction then fails, persist and throw that acknowledgement failure. Preserve ordinary same-transaction processing precedence, BUG-285 fresh failure persistence, and add the fake controller regression plus retry-success control. | Another global precedence flag/branch, a generic error-precedence framework, or changes to BUG-296's handled missing-user outcome. | (a) Makes the existing phase boundary explicit without a framework; (b) the wrong error was reproduced through the production controller with fakes; (c) Blast radius: retry remains safe but ledger/throw/log identify the already-handled FK instead of the transaction blocking acknowledgement. Fix cost: one narrow phase result/function and two tests; (d) each error has one owning phase; (e) complements DEBT-452's later projection seam rather than duplicating it. |

The controller must select the causally current primary error before DEBT-452 projects it for storage or logging. A handled business outcome ends the earlier processing phase's ownership; a failure in its separate acknowledgement transaction is therefore primary. Ordinary same-transaction error precedence and fresh-transaction failure-ledger durability remain unchanged.

## Description

BUG-296 made a subscription write that fails the exact missing-user FK a handled done-state: the controller rolls back that failed transaction, then marks the Stripe event processed in a fresh acknowledgement transaction. The controller's pre-existing error-preservation flags cross that new phase boundary and select the wrong primary error if acknowledgement itself fails.

Before FW-2, the subscription transaction stored its caught `SubscriptionUserMissingError` in `processingError` and set `hasProcessingError`. The missing-user catch then awaited `persistAcknowledgedOutcome`; if that separate transaction threw, the outer catch received the acknowledgement failure as `transactionError` but discarded it whenever the stale flag was set:

```ts
const originalError = hasProcessingError
  ? processingError
  : transactionError;
await persistFailure(deps, event, originalError);
throw originalError;
```

(pre-resolution `stripe-webhook-controller.ts#L305-L310`)

> **Resolution anchor correction (2026-07-21, FW-2):** [`processSubscriptionWebhook`](../../../src/adapters/controllers/stripe-webhook-controller.ts#L134) now owns same-transaction selection through line 245; its handled missing-user acknowledgement is lines 230-242, and acknowledgement failures cross into the outer failure-ledger boundary at [`processStripeWebhook` lines 290-327](../../../src/adapters/controllers/stripe-webhook-controller.ts#L290) without the earlier phase's flags.

A fake-boundary reproduction ran the expected three transactions: subscription processing failed missing-user, acknowledgement threw `ack transaction unavailable`, and failure-ledger persistence succeeded. The controller stored and threw `SubscriptionUserMissingError / NOT_FOUND`; the actual acknowledgement failure was absent.

## Impact

The route still returns a retryable 500, Stripe redelivers, and a later healthy acknowledgement can self-heal. No event is falsely acknowledged and no subscription state is corrupted. The harm is operational: the durable `stripe_events.error`, controller throw, and route log all diagnose the already-handled missing-user condition instead of the database/transaction failure that prevented acknowledgement. This can misdirect incident response on the exact recovery path BUG-296 added. P4 is appropriate.

## Root Cause

`processingError` exists to preserve an application error when a transaction wrapper might surface a secondary rollback error from the **same processing attempt**. BUG-296 introduced a second, semantically independent transaction after the missing-user error had been accepted as a terminal business outcome. The mutable error flag was not retired at that phase boundary, so “first processing cause” incorrectly outranks “current acknowledgement failure.”

## Proposed Resolution

1. **CHOSEN, minimal form:** Make transaction-phase ownership explicit with one small function boundary or typed phase result. Once `SubscriptionUserMissingError` has been classified as handled, an acknowledgement failure becomes the primary error persisted and thrown. A generic error-precedence framework or another mutable global precedence flag is rejected.
2. **CHOSEN, required invariant:** Preserve the existing same-transaction primary-error behavior for ordinary subscription writes and non-subscription events; do not regress BUG-285's fresh-transaction failure ledger or BUG-296's handled missing-user outcome.
3. **CHOSEN, required proof:** Add a controller test with fakes in which the subscription transaction throws missing-user, the acknowledgement transaction fails, and the failure-ledger transaction succeeds. Assert that the acknowledgement error — not `SubscriptionUserMissingError` — is both stored and thrown. Add a retry-success control proving the later delivery still acknowledges normally.

## Verification

- Controller test: missing-user processing rolls back, acknowledgement fails, fresh failure persistence succeeds, and the exact acknowledgement error is both stored and rethrown.
- Control: the same event on a later healthy delivery acknowledges successfully; ordinary processing failures still preserve their mapped same-transaction error through BUG-285's fresh failure transaction.

## Relationship to DEBT-452

[DEBT-452](./debt-452-db-failure-observability.md) owns cause-dropping repository wrappers and the safe projection of database diagnostics into logs/ledgers. This finding is earlier in the pipeline: the controller selects the wrong error object before any projector runs. A complete DEBT-452 fix cannot recover an acknowledgement failure that this control flow discarded, so the items should be cross-linked but not merged.

## Related

- [BUG-296 (archived)](../bugs/bug-296-post-deletion-subscription-webhooks-fail-users-fk.md) — introduced the handled missing-user acknowledgement transaction whose failure exposes this stale-error selection.
- [BUG-285 (archived)](../bugs/bug-285-stripe-webhook-markfailed-on-aborted-transaction.md) — established fresh-transaction failure persistence and the need to retain the actual primary failure.
- [DEBT-452](./debt-452-db-failure-observability.md) — complementary error-diagnostic projection and logging safety work.

Found during the 2026-07-14 fix-wave-3 close adversarial regression review of `ba457afd...76de5ba3` (independent finder lenses and a 3-verifier panel).
