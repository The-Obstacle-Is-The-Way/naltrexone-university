# BUG-199: Unsafe `[0]` Array Access Without Bounds Checking

**Priority:** P2 (1 crash-risk instance) / P4 (3 style-only instances)
**Created:** 2026-03-07
**Revised:** 2026-03-07 (tracer bullet verification — 3 of 4 instances reclassified as safe)
**Source:** [AUDIT-011](../audits/audit-011-error-observability-defensive-coding.md)
**Status:** Open

---

## Problem

One location accesses `array[0]` on external API data and then accesses properties on the result **without optional chaining or a guard**, causing a `TypeError` crash if the array is empty.

Three additional locations also use `[0]` but are **already safe** via optional chaining, nullish coalescing, or downstream filtering. These are noted as P4 style consistency items.

---

## Instance 1: `stripe-subscription-normalizer.ts:55` — CRASH RISK (P2)

```typescript
const subscriptionItem = subscription.items.data[0];
const currentPeriodEndSeconds = subscriptionItem.current_period_end; // crashes if undefined
const cancelAtPeriodEnd = subscription.cancel_at_period_end;
const priceId = subscriptionItem.price.id; // crashes if undefined
```

**Risk:** If Stripe returns a subscription with an empty `items.data` array (e.g., during plan migration or API inconsistency), the normalizer crashes with `TypeError: Cannot read properties of undefined`. This is called from webhook processing — a crash here means the webhook returns 500 and Stripe retries, potentially causing repeated failures.

**Fix:**
```typescript
const subscriptionItem = subscription.items.data[0];
if (!subscriptionItem) {
  throw new ApplicationError(
    'STRIPE_ERROR',
    'Stripe subscription has no items',
  );
}
```

---

## Style-Only Instances (P4 — already safe, no crash possible)

These instances use `[0]` without `?.[0]`, but are protected by downstream guards. Listing for style consistency only.

### `stripe-checkout-sessions.ts:133` — SAFE

```typescript
const existingSession = existing.data[0];
const existingUrl = existingSession?.url;
if (existingSession && existingUrl) { ... }
```

**Why safe:** Optional chaining on `existingSession?.url` returns `undefined`. The `if (existingSession && existingUrl)` guard on line 135 prevents any further access. No crash possible.

### `clerk-auth-gateway.ts:44` — SAFE

```typescript
return user.emailAddresses[0]?.emailAddress ?? null;
```

**Why safe:** `[0]` on an empty array returns `undefined`. `?.emailAddress` returns `undefined`. `?? null` returns `null`. No crash possible.

### `get-session-history.ts:58` — SAFE

```typescript
.map((session) => session.questionIds[0])
.filter((id): id is string => typeof id === 'string'),
```

**Why safe:** `[0]` on an empty array returns `undefined`. The `.filter()` on line 59 explicitly filters out non-string values (including `undefined`). The second usage at line 87 uses `?? ''` as a fallback. No crash possible.

---

## Root Cause

Instance 1 trusts the Stripe SDK's typed response without a defensive bounds check. The Stripe SDK types declare `items.data` as `Array<Stripe.SubscriptionItem>`, which TypeScript treats as always indexable, but the runtime array could be empty.

---

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Stripe subscription with empty `items.data` | `ApplicationError('STRIPE_ERROR', 'Stripe subscription has no items')` thrown, not `TypeError` |
