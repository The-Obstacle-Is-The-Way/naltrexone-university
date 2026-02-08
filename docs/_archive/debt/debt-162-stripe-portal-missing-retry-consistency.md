# DEBT-162: Stripe Portal Session Creation Has Inconsistent Retry Behavior

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07
**Resolved:** 2026-02-08

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

`createStripePortalSession` now always calls `callStripeWithRetry`, regardless of idempotency-key presence:

- with idempotency key: forwards `{ idempotencyKey }` request options
- without idempotency key: still uses retry wrapper and calls Stripe without request options
- added direct unit coverage for retry behavior when no idempotency key is provided

## Verification

- [x] Both code paths use `callStripeWithRetry`
- [x] Unit test for retry behavior on portal session creation

## Related

- `src/adapters/gateways/stripe/stripe-portal.ts:32-44`
- `src/adapters/gateways/stripe/stripe-portal.test.ts`
