# DEBT-155: Stripe Legacy Duplicate Subscription Reconciliation

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-07

---

## Description

Checkout is now guarded against creating new duplicates, but existing Stripe customers may already have multiple active/trialing subscriptions from legacy behavior.

This is operational debt: we need a repeatable reconciliation process to detect and remediate duplicate paid subscriptions already present in Stripe.

## Current State

- Reconciliation job now detects duplicate blocking subscriptions per customer in `src/adapters/jobs/reconcile-stripe-subscriptions.ts`
- Canonical selection implemented:
  - Prefer the subscription already mirrored in local `stripe_subscriptions` when it is still blocking
  - Otherwise choose the blocking subscription with latest `currentPeriodEnd` (tie-break by subscription id)
- Duplicate remediation implemented:
  - `dryRun=true` (default) reports duplicate sets without cancellation
  - `dryRun=false` cancels duplicate blocking subscriptions with idempotency keys
- API route supports safe execution controls: `POST /api/cron/reconcile-stripe-subscriptions?limit=...&offset=...&dryRun=true|false`
- Unit coverage expanded in `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts`
- Duplicate-creation guardrails already in place at checkout (`ALREADY_SUBSCRIBED`)

## Reconciliation Executed (2026-02-07)

### Scope

- 2 users in database, 1 Stripe customer (`cus_TvnxIbgBSEEqp6`, `jj@novamindnyc.com`)
- Stripe test mode — no real charges involved (Visa 4242 test card)

### Findings

3 active subscriptions found for single customer, all created within 8 minutes on 2026-02-06:

| Subscription ID | Created | Status | Disposition |
|----------------|---------|--------|-------------|
| `sub_1SxwUEKItmaHAwgUESbx3reB` | 21:22:44 UTC | active | **Kept** (canonical — mirrored in local DB) |
| `sub_1SxwN0KItmaHAwgUR9rx4yXf` | 21:15:17 UTC | active | Canceled |
| `sub_1SxwLzKItmaHAwgUGe1TI6zW` | 21:14:13 UTC | active | Canceled |

3 duplicate payment methods found (1 per checkout session):

| Payment Method ID | Disposition |
|------------------|-------------|
| `pm_1SxwUBKItmaHAwgUbaxLHeh6` | **Kept** (belongs to canonical subscription) |
| `pm_1SxwMyKItmaHAwgUhwUXZHkB` | Detached |
| `pm_1SxwLwKItmaHAwgUuWEaxsQO` | Detached |

3 test-mode invoices ($29 each, all "paid") — no refund needed (test card).

### Root Cause

Duplicates were created before BUG-101 fix. The old `createStripeCheckoutSession` only checked for open checkout sessions, not existing Stripe subscriptions. Three checkouts within 8 minutes each created a new subscription.

### Post-Cleanup State

- 1 active subscription remaining (canonical)
- 2 subscriptions canceled
- 1 payment method remaining
- Local DB unchanged (already had only the canonical subscription)
- Billing portal now shows single subscription

## Impact

- Users can be billed multiple times for the same product until duplicates are canceled.
- Support/refund workload increases.
- Trust and billing correctness are at risk even after code-level prevention is fixed.

## Resolution

1. Build and run a controlled reconciliation workflow for Stripe test + production:
   - Find customers with more than one blocking subscription (`active`, `trialing`, `past_due`, `unpaid`, `incomplete`, `paused`).
   - Keep the canonical subscription per customer and cancel extras safely.
   - Canonical selection rule implemented in code: if local `stripe_subscriptions` mapping is still blocking, keep it; otherwise choose the blocking subscription with latest `currentPeriodEnd` (tie-break by subscription id).
   - Execute in two phases: `dryRun=true` first, then `dryRun=false` after sign-off.
2. Record an immutable audit trail for every affected customer.
   - Required fields: `customer_id`, `kept_subscription_id`, `canceled_subscription_ids[]`, `timestamp_utc`, `operator`, `reason`, `dry_run`.
   - Storage: append-only reconciliation artifact under secure ops storage plus a linked run summary in the internal incident/runbook ticket.
3. Backfill/verify local `stripe_subscriptions` rows align with canonical Stripe state after reconciliation.
4. Run customer impact workflow for any account with confirmed duplicate charges:
   - Customer communication: send a billing correction notice within 1 business day of reconciliation, including support contact path.
   - Refund process: issue refunds only for confirmed duplicate charges, using Stripe refund APIs with idempotency keys (`refund_duplicate_charge:<charge_id>`), and record refund ids in the audit trail.
5. Define rollback/mitigation:
   - If canonical selection is wrong, recreate canceled subscriptions only for affected customers and restore local mapping from the audit trail snapshot.
   - Pause further reconciliation runs immediately if safety thresholds are breached (see verification).

## Verification

- [x] Reconciliation code supports duplicate detection and canonical selection
- [x] Reconciliation code supports `dryRun` and non-dry-run cancellation paths
- [x] Unit tests cover duplicate cancellation and dry-run safety paths
- [x] Stripe test-mode audit completed — 1 customer, 3 subs found, 2 canceled, 1 kept
- [x] No production run needed — test mode is the only environment with data (same Stripe account)
- [x] Quantitative success: affected customers with >1 blocking subscription reduced from 1 to 0
- [x] Spot-check: billing portal shows single subscription after cleanup
- [x] No refunds needed — all charges are test-mode (Visa 4242)
- [x] Checkout guard (BUG-101) prevents future duplicates
- [x] 30-day monitoring not applicable — test mode, single developer account

## Related

- `docs/_archive/bugs/bug-101-stripe-checkout-allows-duplicate-subscriptions-when-db-stale.md`
- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts`
- `src/adapters/jobs/reconcile-stripe-subscriptions.ts`
- `app/api/cron/reconcile-stripe-subscriptions/route.ts`
