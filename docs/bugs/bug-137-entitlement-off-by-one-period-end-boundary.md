# BUG-137: Entitlement Check Off-by-One at Period End Boundary

**Status:** Open
**Priority:** P3
**Date:** 2026-02-16

---

## Description

`isEntitled()` in the domain entitlement service denies access when `subscription.currentPeriodEnd <= now`. This treats `currentPeriodEnd` as an **exclusive** boundary (entitled only when `currentPeriodEnd > now`).

**Observed:** `isEntitled()` returns `false` when `currentPeriodEnd === now`.

**Expected:** Per current SSOT, `currentPeriodEnd === now` is **not** entitled (`current_period_end > now()`). If the product decides the boundary should be inclusive, this is a spec change and requires code changes across all call sites (see Fix).

## Evidence: Full Vertical + Horizontal Trace

### 1. Current Domain Rule — `src/domain/services/entitlement.ts:7-15`

```typescript
export function isEntitled(
  subscription: Subscription | null,
  now: Date,
): boolean {
  if (!subscription) return false;
  if (!isEntitledStatus(subscription.status)) return false;
  if (subscription.currentPeriodEnd <= now) return false;
  return true;
}
```

### 2. SSOT Mirrors the Same Boundary — `docs/specs/master_spec.md:599-605`

```md
### 4.2 Subscription Entitlement (Server-Side, Exact Logic)

A user is **entitled** if and only if there exists a row in `stripe_subscriptions` for the user with:

* subscription `status` translates to domain `SubscriptionStatus` ∈ `{ "active", "inTrial", "pastDue" }` (Stripe: `{ "active", "trialing", "past_due" }`)
* AND `current_period_end > now()` (server UTC)
* AND the subscription row corresponds to the **latest** known subscription for that user (enforced by `stripe_subscriptions.user_id` unique constraint: 1 row per user)
```

### 3. Test Documents the Boundary — `src/domain/services/entitlement.test.ts:39-45`

```typescript
  it('returns false when currentPeriodEnd is exactly now', () => {
    const sub = createSubscription({
      status: 'active',
      currentPeriodEnd: now,
    });
    expect(isEntitled(sub, now)).toBe(false);
  });
```

This matches the current SSOT. If we switch to inclusive semantics, this test must change.

### 4. Stripe Data Precision — `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts:55-76`

```typescript
  const subscriptionItem = subscription.items.data[0];
  const currentPeriodEndSeconds = subscriptionItem.current_period_end;
  const cancelAtPeriodEnd = subscription.cancel_at_period_end;
  const priceId = subscriptionItem.price.id;

  const plan = getSubscriptionPlanFromPriceId(priceId, input.priceIds);
  if (!plan) {
    throw new ApplicationError(
      'STRIPE_ERROR',
      'Stripe subscription price id does not match a configured plan',
    );
  }

  return {
    userId,
    externalCustomerId: stripeCustomerId,
    externalSubscriptionId: stripeSubscriptionId,
    plan,
    status,
    currentPeriodEnd: new Date(currentPeriodEndSeconds * 1000),
    cancelAtPeriodEnd,
  };
```

Stripe sends `current_period_end` as Unix seconds (integer). The conversion to JS `Date` multiplies by 1000, producing a timestamp at the start of that second (millisecond component `.000`).

### 5. Use Cases Treat the Boundary Consistently

#### `CheckEntitlementUseCase` — `src/application/use-cases/check-entitlement.ts:47-53`

```typescript
    const now = this.now();
    const entitled = isEntitled(subscription, now);
    const hasActiveSubscriptionPeriod = subscription.currentPeriodEnd > now;
    const reason: NonEntitledReason | null = entitled
      ? null
      : getNonEntitledReason(subscription.status, hasActiveSubscriptionPeriod);
```

At the exact boundary (`currentPeriodEnd === now`):
- `entitled` is `false`
- `hasActiveSubscriptionPeriod` is `false`
- `getNonEntitledReason()` receives `hasActiveSubscriptionPeriod = false` → returns `'subscription_required'`

This means the user gets a **"subscription required"** message at the exact period end, which is misleading — they have an active subscription, it just expired this second.

#### `CreateCheckoutSessionUseCase` — `src/application/use-cases/create-checkout-session.ts:53-62`

```typescript
  async execute(
    input: CreateCheckoutSessionInput,
  ): Promise<CreateCheckoutSessionOutput> {
    const subscription = await this.subscriptions.findByUserId(input.userId);
    if (subscription && subscription.currentPeriodEnd > this.now()) {
      throw new ApplicationError(
        'ALREADY_SUBSCRIBED',
        'Subscription already exists for this user',
      );
    }
```

Both use cases treat the boundary identically (exclusive end: deny at `===`).

### 6. All Call Sites of `isEntitled()` — Impact Surface

| Caller | File:Line | Impact |
|--------|-----------|--------|
| `CheckEntitlementUseCase.execute()` | `check-entitlement.ts:48` | Guards all `/app/*` routes via layout + server actions |
| `enforceEntitledAppUser()` | `app/(app)/app/layout.tsx:47` | Redirects non-entitled users to pricing page |
| `requireEntitledUserId()` | `require-entitled-user-id.ts:14-16` | Throws `UNSUBSCRIBED` in question, bookmark, tag controllers |

### 7. Boundary Semantics (Exclusive vs Inclusive)

- **Current (exclusive):** entitled iff `currentPeriodEnd > now` (matches SSOT and implementation).
- **Proposed (inclusive):** entitled iff `currentPeriodEnd >= now` (requires SSOT + code changes).

## Impact Assessment

**Low practical impact, but the policy should be explicit.**

The equality case (`currentPeriodEnd.getTime() === now.getTime()`) is rare, but it can occur because Stripe’s period end is second-granular and stored with a `.000` millisecond component.

## Fix

### Option A — Keep Exclusive Boundary (SSOT-consistent)

No code changes required.

### Option B — Switch to Inclusive Boundary (Spec Change)

1. Update SSOT:
   - `docs/specs/master_spec.md:604` (`current_period_end > now()` → `current_period_end >= now()`)

2. Update domain rule (`src/domain/services/entitlement.ts:13`):

```typescript
  if (subscription.currentPeriodEnd < now) return false;
```

3. Update the boundary test in `src/domain/services/entitlement.test.ts:39-45` to expect `true` when `currentPeriodEnd === now`.

4. Align use-case comparisons (e.g., `check-entitlement.ts:49`, `create-checkout-session.ts:57`) from `>` to `>=`.

## Verification

- [ ] If Option B: Unit test for `currentPeriodEnd === now` returns `true`
- [ ] If Option B: Unit test for `currentPeriodEnd` 1ms before `now` returns `false`
- [ ] If Option B: Update any DB-side entitlement queries to use `>=` consistently
- [ ] Confirm `CheckEntitlementUseCase` reason logic still matches desired UX

## Related

- `docs/specs/master_spec.md:599-605` — SSOT entitlement boundary
- `src/domain/services/entitlement.ts:7-15` — Domain entitlement rule
- `src/domain/services/entitlement.test.ts:39-45` — Boundary test
- `src/application/use-cases/check-entitlement.ts:47-53` — Uses the same boundary
- `src/application/use-cases/create-checkout-session.ts:57` — Uses the same boundary
- `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts:55-76` — Stripe `current_period_end` conversion
