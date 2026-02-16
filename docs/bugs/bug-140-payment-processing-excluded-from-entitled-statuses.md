# BUG-140: `paymentProcessing` Excluded from EntitledStatuses — Potential User Lockout

**Status:** Open
**Priority:** P3
**Date:** 2026-02-16

---

## Description

The domain `EntitledStatuses` list grants access for `active`, `inTrial`, and `pastDue` subscriptions, but explicitly excludes `paymentProcessing`. This means users whose payment is being processed (e.g., during initial checkout or renewal with a slow payment method) lose access to premium features during the processing window.

**Observed:** A subscription with `status: 'paymentProcessing'` is treated as not entitled.

**Expected:** This is a business decision that should be explicitly documented. If the exclusion is intentional, a code comment should explain why. If not, `paymentProcessing` should be added to `EntitledStatuses`.

## Root Cause

`src/domain/value-objects/subscription-status.ts:29-33`:
```typescript
export const EntitledStatuses: readonly SubscriptionStatus[] = [
  'active',
  'inTrial',
  'pastDue',
];
```

Note: BUG-077 already implemented redirect context for `paymentProcessing` users with a specific message, which suggests the lockout is partially intentional. However, there is no inline documentation explaining the entitlement design decision.

## Impact Assessment

- Users transitioning from checkout to active status may briefly lose access
- The redirect messaging from BUG-077 mitigates UX confusion
- However, if Stripe webhook delivery is delayed, the lockout window could extend

## Fix

Add an inline comment documenting the design decision:

```typescript
/**
 * Statuses that grant access to premium features.
 *
 * `paymentProcessing` is intentionally excluded because users should not
 * receive access until payment is confirmed. The app layout provides
 * redirect context with messaging for this state (see BUG-077).
 */
export const EntitledStatuses: readonly SubscriptionStatus[] = [
  'active',
  'inTrial',
  'pastDue',
];
```

Or, if the design intent is to grant access during processing, add `'paymentProcessing'` to the list.

## Verification

- [ ] Review business requirements for payment-processing entitlement
- [ ] Verify BUG-077 redirect messaging covers this state adequately

## Related

- `src/domain/value-objects/subscription-status.ts:26-40`
- `src/domain/services/entitlement.ts:7-15`
- [BUG-077](../../_archive/bugs/bug-077-payment-processing-confusing-redirect.md) — Payment processing redirect context
