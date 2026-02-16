# BUG-137: Entitlement Check Off-by-One at Period End Boundary

**Status:** Open
**Priority:** P3
**Date:** 2026-02-16

---

## Description

`isEntitled()` in the domain entitlement service uses `<=` to compare `currentPeriodEnd` against `now`, which denies access at the exact second the period ends. Stripe's convention is that subscriptions are active *through* `current_period_end` (inclusive). This is a correctness issue, though with low practical impact due to the narrow timing window.

**Observed:** `isEntitled()` returns `false` when `currentPeriodEnd === now`.

**Expected:** Access should be granted through the end of the period (`currentPeriodEnd === now` should return `true`).

## Evidence: Full Vertical + Horizontal Trace

### 1. The Bug — `src/domain/services/entitlement.ts:13`

```typescript
export function isEntitled(
  subscription: Subscription | null,
  now: Date,
): boolean {
  if (!subscription) return false;
  if (!isEntitledStatus(subscription.status)) return false;
  if (subscription.currentPeriodEnd <= now) return false;   // ← BUG: <= should be <
  return true;
}
```

### 2. Test Intentionally Documents the Bug — `src/domain/services/entitlement.test.ts:39-45`

```typescript
it('returns false when currentPeriodEnd is exactly now', () => {
  const sub = createSubscription({
    status: 'active',
    currentPeriodEnd: now,          // ← Exact same timestamp as 'now'
  });
  expect(isEntitled(sub, now)).toBe(false);   // ← Asserts denial at boundary
});
```

This test asserts the **current (buggy) behavior**, not the desired behavior. It locks in the off-by-one.

### 3. Stripe Data Precision — `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts:56,74`

```typescript
const currentPeriodEndSeconds = subscriptionItem.current_period_end;  // Line 56: Unix seconds
currentPeriodEnd: new Date(currentPeriodEndSeconds * 1000),           // Line 74: → JS milliseconds
```

Stripe sends `current_period_end` as **Unix seconds** (integer). The conversion to JS Date multiplies by 1000, producing a timestamp at the start of that second (e.g., `1800000000` → `2027-01-15T08:00:00.000Z`). The millisecond component is always `.000`.

### 4. Inconsistency Within `CheckEntitlementUseCase` — `src/application/use-cases/check-entitlement.ts:47-49`

```typescript
const now = this.now();
const entitled = isEntitled(subscription, now);                           // Uses <=
const hasActiveSubscriptionPeriod = subscription.currentPeriodEnd > now;  // Uses >
```

At the exact boundary (`currentPeriodEnd === now`):
- `isEntitled()` returns `false` (user denied)
- `hasActiveSubscriptionPeriod` is `false` (period not active)
- `getNonEntitledReason()` receives `hasActiveSubscriptionPeriod = false` → returns `'subscription_required'`

This means the user gets a **"subscription required"** message at the exact period end, which is misleading — they have an active subscription, it just expired this second.

### 5. Second Inconsistency — `src/application/use-cases/create-checkout-session.ts:57`

```typescript
if (subscription && subscription.currentPeriodEnd > this.now()) {
```

Both `CheckEntitlementUseCase` and `CreateCheckoutSessionUseCase` treat the boundary identically (denying at `===`), but neither aligns with Stripe convention.

### 6. All Call Sites of `isEntitled()` — Impact Surface

| Caller | File:Line | Impact |
|--------|-----------|--------|
| `CheckEntitlementUseCase.execute()` | `check-entitlement.ts:48` | Guards all `/app/*` routes via layout + server actions |
| `enforceEntitledAppUser()` | `app/(app)/app/layout.tsx:47` | Redirects non-entitled users to pricing page |
| `requireEntitledUserId()` | `require-entitled-user-id.ts:14-16` | Throws `UNSUBSCRIBED` in question, bookmark, tag controllers |

Every premium feature is gated through `isEntitled()`. The off-by-one affects **all** of them simultaneously.

### 7. Stripe Convention

Stripe's subscription model treats `current_period_end` as the **inclusive** end of the billing period. The subscription remains active through this timestamp. Access should be granted when `now <= currentPeriodEnd`, meaning denial should only occur when `now > currentPeriodEnd` (i.e., `currentPeriodEnd < now`).

## Impact Assessment

**Low practical impact, high correctness importance.**

The window where `currentPeriodEnd.getTime() === now.getTime()` is 1 millisecond out of ~2.6 billion per month (Stripe uses second granularity, so technically 1 second out of ~2.6M per month). However:

1. This is a **domain rule correctness** issue — the code misrepresents the business logic
2. The **test locks in the wrong behavior**, making it harder to spot
3. The **inconsistency** between operators (`<=` vs `>`) across use cases is confusing

## Fix

Change `<=` to `<` in `src/domain/services/entitlement.ts:13`:

```typescript
if (subscription.currentPeriodEnd < now) return false;
```

Update the boundary test in `src/domain/services/entitlement.test.ts:39-45`:

```typescript
it('returns true when currentPeriodEnd is exactly now', () => {
  const sub = createSubscription({
    status: 'active',
    currentPeriodEnd: now,
  });
  expect(isEntitled(sub, now)).toBe(true);   // ← Now matches Stripe convention
});
```

Align `check-entitlement.ts:49` for consistency:

```typescript
const hasActiveSubscriptionPeriod = subscription.currentPeriodEnd >= now;
```

## Verification

- [ ] Unit test: `it('returns true when currentPeriodEnd equals now')` (update existing)
- [ ] Unit test: `it('returns false when currentPeriodEnd is 1ms before now')` (boundary)
- [ ] Verify `CheckEntitlementUseCase` reason logic still correct
- [ ] Verify `CreateCheckoutSessionUseCase` boundary aligned

## Related

- `src/domain/services/entitlement.ts:7-15` — Bug location
- `src/domain/services/entitlement.test.ts:39-45` — Test that locks in wrong behavior
- `src/application/use-cases/check-entitlement.ts:47-49` — Operator inconsistency
- `src/application/use-cases/create-checkout-session.ts:57` — Second inconsistency
- `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts:56,74` — Data conversion
