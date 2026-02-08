# DEBT-162: Stripe Portal Session Creation Has Inconsistent Retry Behavior

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

`createStripePortalSession` in `stripe-portal.ts` has two code paths for creating a billing portal session:

```typescript
const session = requestOptions
  ? await callStripeWithRetry({...})  // With retry + idempotency key
  : await stripe.billingPortal.sessions.create(params);  // No retry
```

When `requestOptions` (containing an idempotency key) is provided, the call goes through `callStripeWithRetry`. When it's not provided, the call goes directly to the Stripe SDK without retry logic.

This means:
- Idempotent requests get retry protection
- Non-idempotent requests get no retry and no structured error logging

## Impact

- Inconsistent reliability between the two code paths
- Network blips during portal session creation without idempotency key will fail without retry
- Low severity: portal sessions are non-critical (user can retry manually) and most callers provide idempotency keys

## Resolution

Always use `callStripeWithRetry` regardless of whether an idempotency key is provided. The retry wrapper is safe for non-idempotent calls (portal sessions are ephemeral).

## Verification

- [ ] Both code paths use `callStripeWithRetry`
- [ ] Unit test for retry behavior on portal session creation

## Related

- `src/adapters/gateways/stripe/stripe-portal.ts:32-44`
