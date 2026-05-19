# DEBT-385: Stripe Invoice Event Subscription Reference Schema Drift

**Priority:** P2
**Created:** 2026-05-14
**Source:** Filed from DEBT-384 after live Stripe payload inspection found invoice events no longer expose the subscription reference at the root field our schema reads.
**Related:** [DEBT-384](../_archive/debt/debt-384-stripe-webhook-error-rate-investigation.md)
**Status:** Active — documented only. DEBT-384 has shipped and been archived; this remains a separate follow-up.

**Origin:** The app is pinned to Stripe API version `2026-01-28.clover` at `lib/stripe.ts:22`. The value changed from `2025-04-30.basil` to Clover in commit `d9f3cbe4` (`Fix Stripe API version for updated stripe SDK`) on 2026-01-31, and commit `84b4c0463` only moved that already-Clover pin into lazy initialization. Current Clover invoice events expose the subscription reference at `data.object.parent.subscription_details.subscription`, so this schema drift has been possible since the Clover pin.

---

## Confirmed Finding

A live test-mode `invoice.payment_succeeded` payload retrieved during the DEBT-384 investigation had:

```text
data.object.subscription: null
data.object.parent.subscription_details.subscription: "sub_..."
```

The current schema at `src/adapters/gateways/stripe/stripe-webhook-schemas.ts:25-32` only reads root-level `subscription` via `stripeCheckoutSessionSchema`, which is also aliased as `stripeEventWithSubscriptionRefSchema` at line 34. `getSubscriptionUpdateForSubscriptionRefEvent` in `src/adapters/gateways/stripe/stripe-webhook-processor.ts:13-51` receives no root-level reference for these invoice events, so it returns `undefined`. The webhook controller then marks the event processed and returns 200 with no subscription update.

That is a silent no-op, not a delivery failure.

---

## Why This Is Debt

The current behavior is masked because Stripe usually emits parallel `customer.subscription.updated` events for the same billing-cycle state changes, and that subscription-event path retrieves and normalizes the subscription correctly. If Stripe emits an invoice-event-only transition, or if endpoint configuration misses the parallel subscription event, the app can silently miss a subscription state update while still returning 200 to Stripe.

This is separate from DEBT-384's missing subscription metadata failure. DEBT-384 returns 500 on `customer.subscription.*` events for out-of-band subscriptions. DEBT-385 returns 200 on invoice events while doing nothing because the subscription reference is not found.

---

## Proposed Fix Direction

Extend the invoice/checkout subscription-reference extraction so invoice events can read the nested Stripe field:

```text
data.object.parent.subscription_details.subscription
```

while preserving support for the existing root-level `subscription` field used by Checkout Session payloads and older invoice payloads.

Expected test surfaces:

- `src/adapters/gateways/stripe/stripe-webhook-processor.test.ts`
- `src/adapters/gateways/stripe-payment-gateway.test.ts`
- `src/adapters/gateways/stripe/stripe-webhook-schemas.test.ts` (new)

Use a real fixture shape matching the observed Stripe payload. Avoid hard-coding behavior to a single event ID.

---

## Out of Scope

- DEBT-384 metadata-missing skip behavior
- E2E seed subscription metadata
- Stripe endpoint event-subscription configuration
- Stripe Dashboard cleanup of phantom subscriptions
- Reconciliation cron changes

---

## Acceptance Criteria

- `invoice.payment_succeeded` and `invoice.payment_failed` payloads with `parent.subscription_details.subscription` produce a subscription update.
- Root-level `subscription` remains supported for Checkout Session and older compatible payloads.
- Missing subscription reference still returns no subscription update intentionally.
- Tests cover both nested and root-level reference locations.
