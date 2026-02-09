# BUG-119: Stripe 'ended' Subscription Status Missing from DB Enum

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-08
**Resolved:** 2026-02-09

---

## Description

The `StripeSubscriptionStatus` type in `src/adapters/shared/stripe-types.ts` previously defined 9 valid statuses including `'ended'`. However, Stripe subscription statuses do not include `'ended'` (the terminal status is `canceled`, with an `ended_at` timestamp for when it ended).

This was a documentation/type drift issue: the DB enum (`stripeSubscriptionStatusEnum` in `db/schema.ts`) and runtime validator (`isValidStripeSubscriptionStatus`) were correct; the adapter-level type union was overly permissive and could mislead future code into treating `'ended'` as a real Stripe status.

## Affected Files

| File | Issue |
|------|-------|
| `src/adapters/shared/stripe-types.ts:53-62` | Included `'ended'` in `StripeSubscriptionStatus` union |
| `src/adapters/gateways/stripe/stripe-subscription-status.ts` | `isValidStripeSubscriptionStatus` uses DB enum |

## Impact

- No known runtime impact (Stripe does not emit `'ended'` as a subscription status)
- Leaving the extra union member could cause future code to handle an impossible status branch or create an invalid mapping

## Resolution

Removed `'ended'` from the `StripeSubscriptionStatus` union in `src/adapters/shared/stripe-types.ts` and added a type-level regression test to keep the union aligned with Stripe status values.

## Verification

- `pnpm typecheck` — types align
- `pnpm test --run` — existing tests pass

## Related

- DEBT-183 (resolved — Stripe webhook error handling)
