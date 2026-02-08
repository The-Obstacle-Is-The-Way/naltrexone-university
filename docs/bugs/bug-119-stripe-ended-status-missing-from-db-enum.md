# BUG-119: Stripe 'ended' Subscription Status Missing from DB Enum

**Status:** Open
**Priority:** P3
**Date:** 2026-02-08

---

## Description

The `StripeSubscriptionStatus` type in `src/adapters/shared/stripe-types.ts` defines 9 valid statuses including `'ended'`. However, the database schema enum (`stripeSubscriptionStatusEnum` in `db/schema.ts`) only defines 8 values and omits `'ended'`.

The `isValidStripeSubscriptionStatus` function uses the DB enum as its source of truth. If Stripe sends a webhook with `subscription.status = 'ended'`, the webhook processor will throw `'Stripe subscription status is invalid'` instead of processing the event gracefully.

## Affected Files

| File | Issue |
|------|-------|
| `db/schema.ts` | `stripeSubscriptionStatusEnum` missing `'ended'` value |
| `src/adapters/shared/stripe-types.ts:53-62` | Defines 9 statuses including `'ended'` |
| `src/adapters/gateways/stripe/stripe-subscription-status.ts` | `isValidStripeSubscriptionStatus` uses DB enum |

## Impact

- Stripe assigns `ended` status when a subscription reaches its natural end (e.g., after a fixed number of billing cycles or when explicitly ended via API)
- If this status arrives via webhook, the entire event processing fails with an error
- The subscription record is not updated in the database, leaving it in a stale state
- The user's entitlement state may become inconsistent

## Resolution

Add `'ended'` to the `stripeSubscriptionStatusEnum` in `db/schema.ts` and create a migration:

```sql
ALTER TYPE stripe_subscription_status ADD VALUE IF NOT EXISTS 'ended';
```

## Verification

- `pnpm typecheck` — types align
- `pnpm test --run` — existing tests pass
- Verify `isValidStripeSubscriptionStatus('ended')` returns `true`

## Related

- DEBT-183 (resolved — Stripe webhook error handling)
