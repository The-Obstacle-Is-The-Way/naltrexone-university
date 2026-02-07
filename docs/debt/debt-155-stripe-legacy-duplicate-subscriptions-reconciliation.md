# DEBT-155: Stripe Legacy Duplicate Subscription Reconciliation

**Status:** In Progress
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
- Remaining work is operational execution + audit/refund workflow + verification checklist completion

## Impact

- Users can be billed multiple times for the same product until duplicates are canceled.
- Support/refund workload increases.
- Trust and billing correctness are at risk even after code-level prevention is fixed.

## Resolution

1. Build and run a controlled reconciliation workflow for Stripe test + production:
   - Find customers with more than one blocking subscription (`active`, `trialing`, `past_due`, `unpaid`, `incomplete`, `paused`).
   - Keep the canonical subscription per customer and cancel extras safely.
   - Canonical selection rule: newest non-canceled subscription with latest billing activity; if tied, prefer the subscription already mirrored in local `stripe_subscriptions`.
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
- [ ] Stripe test-mode run completed and signed off before production cutover (same day)
- [ ] Stripe production run completed within 1 business day of test-mode sign-off
- [ ] Quantitative success: affected customers with more than one blocking subscription reduced from baseline to `0`
- [ ] Spot-check (minimum 20 affected customers or all, whichever is smaller) confirms billing portal shows one current subscription
- [ ] 30-day post-run monitoring window completed with fewer than 5 duplicate-billing support incidents total
- [ ] Rollback trigger remained inactive: no evidence of incorrect canonical selection affecting more than 0.5% of reconciled customers

## Related

- `docs/_archive/bugs/bug-101-stripe-checkout-allows-duplicate-subscriptions-when-db-stale.md`
- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts`
- `src/adapters/jobs/reconcile-stripe-subscriptions.ts`
- `app/api/cron/reconcile-stripe-subscriptions/route.ts`
