# DEBT-029: Untested Stripe Prices Config Module

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-01
**Resolved:** 2026-02-01

---

## Description

`src/adapters/config/stripe-prices.ts` contains critical mapping logic between domain `SubscriptionPlan` values and Stripe price IDs. This configuration is used by payment processing to determine subscription tiers. Zero test coverage exists.

If these mappings are wrong, users could:
- Be charged wrong amounts
- Get wrong subscription tier
- Have billing records mismatched with access

## Location

- **File:** `src/adapters/config/stripe-prices.ts`
- **Missing:** `src/adapters/config/stripe-prices.test.ts`

## Functions Requiring Tests

```typescript
// Maps domain plan to Stripe price ID
export function getStripePriceId(plan: SubscriptionPlan): string;

// Reverse maps Stripe price ID to domain plan
export function getSubscriptionPlanFromPriceId(priceId: string): SubscriptionPlan | null;
```

## Resolution

Create test file:

```typescript
// src/adapters/config/stripe-prices.test.ts
import { describe, it, expect } from 'vitest';
import { getStripePriceId, getSubscriptionPlanFromPriceId } from './stripe-prices';

describe('stripe-prices config', () => {
  describe('getStripePriceId', () => {
    it('returns monthly price ID for monthly plan', () => {
      const priceId = getStripePriceId('monthly');
      expect(priceId).toBe(process.env.STRIPE_PRICE_MONTHLY);
    });

    it('returns annual price ID for annual plan', () => {
      const priceId = getStripePriceId('annual');
      expect(priceId).toBe(process.env.STRIPE_PRICE_ANNUAL);
    });
  });

  describe('getSubscriptionPlanFromPriceId', () => {
    it('returns monthly for monthly price ID', () => {
      const plan = getSubscriptionPlanFromPriceId(process.env.STRIPE_PRICE_MONTHLY!);
      expect(plan).toBe('monthly');
    });

    it('returns annual for annual price ID', () => {
      const plan = getSubscriptionPlanFromPriceId(process.env.STRIPE_PRICE_ANNUAL!);
      expect(plan).toBe('annual');
    });

    it('returns null for unknown price ID', () => {
      const plan = getSubscriptionPlanFromPriceId('price_unknown_12345');
      expect(plan).toBeNull();
    });
  });

  describe('bidirectional mapping', () => {
    it('round-trips monthly plan correctly', () => {
      const priceId = getStripePriceId('monthly');
      const plan = getSubscriptionPlanFromPriceId(priceId);
      expect(plan).toBe('monthly');
    });

    it('round-trips annual plan correctly', () => {
      const priceId = getStripePriceId('annual');
      const plan = getSubscriptionPlanFromPriceId(priceId);
      expect(plan).toBe('annual');
    });
  });
});
```

## Acceptance Criteria

- [x] Test file exists at `src/adapters/config/stripe-prices.test.ts`
- [x] Forward mapping tests (plan → price ID)
- [x] Reverse mapping tests (price ID → plan)
- [x] Unknown price ID returns null test
- [x] Round-trip bidirectional tests
- [x] Tests run in CI

## Related

- ADR-005: Payment Boundary
- SPEC-009: Payment Gateway
