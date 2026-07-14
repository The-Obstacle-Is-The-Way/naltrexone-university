# BUG-297: Checkout-Success Sync Surfaces an Uncaught Observation-Version CONFLICT to a Just-Paid User When the Post-Checkout Webhook Burst Exhausts Its CAS Retries

**Status:** Open
**Severity:** P3
**Date:** 2026-07-14
**Confirmed:** 2026-07-14 (wave-2 close adversarial regression review, 8 lenses over the combined diff `318549f5...cde6ccd8`; confirmed 3/3 by the verification panel and re-verified at source in the orchestrating session)
**Component:** Billing / checkout success / observation-version fence

---

## Resolution State

Implemented on branch `fix/bug-297-checkout-cas-exhaustion-fallback`. The shared observation helper now throws `SubscriptionObservationAttemptsExhaustedError` only when all bounded version-CAS attempts are exhausted. The checkout-success display path discriminates that exact typed outcome, reads the current subscription row, and renders entitlement from that row; a missing fallback row rethrows the typed error. Both the recovered and fail-closed arms emit structured telemetry with the local user id, typed reason, and attempt count for production proof. Generic `CONFLICT` errors, including the user-changed-during-refresh outcome, continue to propagate unchanged. The Stripe webhook controller and its per-attempt retrieval path are untouched.

TDD coverage was added before implementation at the helper boundary (typed exhaustion shape plus a same-code/same-message wrong-shape control) and checkout-success boundary (all attempts lose to concurrent writes but the current active row renders the paid-success state; both recovery branches emit structured logs; the user-changed conflict still throws). Existing webhook CAS tests remain regression coverage for the unchanged path. This document remains **Status: Open** until wave-close archival with production proof.

## Summary

The BUG-287 fix (PR #635) gave every Stripe-refresh writer a bounded observation-version CAS: [`persist-subscription-observation.ts#L69-L74`](../../src/application/shared/persist-subscription-observation.ts#L69-L74) throws `ApplicationError('CONFLICT', 'Subscription observation version conflicted after 3 attempts')` when three consecutive read-version → Stripe-retrieve → persist attempts each lose to a concurrent writer. On the checkout-success page, nothing catches that throw: `syncCheckoutSuccess` calls the loop bare ([`checkout-success-sync.tsx#L258`](<../../app/(marketing)/checkout/success/checkout-success-sync.tsx#L258>)), the page awaits it bare ([`page.tsx#L43`](<../../app/(marketing)/checkout/success/page.tsx#L43>)), and the exhaustion lands in the route error boundary ([`error.tsx`](<../../app/(marketing)/checkout/success/error.tsx>)) — a paying user sees "Checkout error" moments after a successful payment, even though their subscription row is fully correct (written by the webhooks that out-raced the page).

The concurrent writer is not exotic: it is the normal post-checkout webhook burst. A single checkout emits `checkout.session.completed`, `customer.subscription.created`/`updated`, and `invoice.payment_succeeded` within roughly a second; each maps to the same subscription upsert ([`stripe-webhook-controller.ts#L178-L216`](../../src/adapters/controllers/stripe-webhook-controller.ts#L178-L216)), and each persisted write bumps `stripe_subscriptions.version` ([`drizzle-subscription-repository.ts#L128`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L128)) because the write guard passes every same-identity write unconditionally ([`subscription-write-guard.ts#L38-L42`](../../src/domain/services/subscription-write-guard.ts#L38-L42)) — redundant burst events still increment the version. Each of the page's CAS attempts spans a live `stripe.subscriptions.retrieve` (~100–400 ms plus retry backoff), so its read-version → persist window is wide open to that burst; a first-time subscriber loses attempt 1 trivially (read sees no row, a webhook inserts v1 during the retrieve).

Pre-#635 code had no throw path here: the un-versioned upsert either persisted or returned `write_guard_rejected` carrying the fresher current row, which the sync resolved and rendered. The throw is pinned as intended mechanism by `checkout-success-sync-version-fence.test.ts` ("preserves the thrown error path after bounded version conflicts"), so this is a deliberate, tested design choice — but its user-facing consequence at the highest-value moment was never recorded in the register, which makes it a filing, not an accepted residue.

## Reachability

Every production checkout runs this page concurrently with its own webhook burst — ADR-014's premise. Exhaustion needs three webhook commits landing inside three consecutive CAS windows; burst cadence (~100 ms–1 s spacing) matches the loop cadence, so the alignment is unlucky but genuine: low per-checkout probability, nonzero recurring odds across all checkouts.

## Reproduction

1. User completes checkout and lands on `/checkout/success`; Stripe concurrently fires the burst events.
2. `syncCheckoutSuccess`'s attempt 1 reads the local version (none/`v0`), performs the live subscription retrieve; a webhook write commits `v1` in that window → `version_conflict` ([`drizzle-subscription-repository.ts#L99-L100`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L99-L100)).
3. Attempts 2 and 3 repeat the pattern against the remaining burst writes.
4. The loop throws `CONFLICT`; nothing on the route catches it.

Expected: the page renders the confirmed subscription — the row the webhooks just wrote is exactly the state it wants to display.

Actual: the route error boundary replaces the confirmation. Self-healing: the boundary's reset/refresh re-runs the sync after the burst has passed and succeeds.

## Root Cause

PR #635 made CAS exhaustion a thrown terminal outcome uniformly across writers, but the checkout-success call site has a semantically better fallback it already uses for the `write_guard_rejected` branch: read and render the current row. Losing the CAS race here means *someone else already wrote fresher state* — for a display-oriented sync, that is success, not failure.

## Impact

A user-visible "Checkout error" at the moment of payment, with correct underlying state, recoverable by refresh. No entitlement, billing, or data corruption in any interleaving. P3: user-facing failure on the money path, bounded blast radius, self-healing.

## Proposed Fix

1. **RECOMMENDED:** in `syncCheckoutSuccess`, catch the observation-version `CONFLICT` exhaustion and fall back to reading the current local subscription row (the same resolution the `write_guard_rejected` branch performs), rendering entitlement from it. Keep the throw for writers where exhaustion is genuinely ambiguous (webhook/reconcile own their retry semantics).
2. Alternative: raise `SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS` for this call site only. Shrinks but does not remove the window; rejected as primary.
3. Alternative: have the exhaustion throw carry the last-observed row so callers can degrade to display without a second read. More invasive contract change for the same outcome.

## Related

- [BUG-287 (archived)](../_archive/bugs/bug-287-reconcile-cron-stale-snapshot-overwrites-newer-webhook-state.md) — the fix that introduced the CAS loop; its Resolution notes this residual.
- [BUG-242 (archived)](../_archive/bugs/bug-242-stale-subscription-webhook-overwrites-active-row.md) — the re-fetch design that makes each CAS attempt span a live Stripe retrieve.
- [DEBT-457](../debt/debt-457-wave2-determinacy-and-test-hygiene-residues.md) — records the version-fence's per-attempt double-retrieve cost on the webhook path from the same review.

Found during the 2026-07-14 wave-2 close adversarial regression review (8 finder lenses over the combined wave diff, 3-verifier panels per candidate, dedup against known accepted residues).
