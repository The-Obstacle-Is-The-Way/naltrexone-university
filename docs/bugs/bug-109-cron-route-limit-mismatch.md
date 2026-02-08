# BUG-109: Cron Route MAX_LIMIT (1000) Exceeds Reconciliation MAX_LIMIT (500)

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The cron API route defines `MAX_LIMIT = 1000`:

```typescript
// app/api/cron/reconcile-stripe-subscriptions/route.ts:9
const MAX_LIMIT = 1000;
```

But the reconciliation function itself caps at 500:

```typescript
// src/adapters/jobs/reconcile-stripe-subscriptions.ts
const MAX_LIMIT = 500;
```

When the route passes `limit=750`, it clamps to 1000 (passes), but the reconciliation function internally clamps to 500. The route-level validation gives a false impression that limits up to 1000 are supported.

**Observed:** Route accepts limits up to 1000 but reconciliation silently caps at 500.

**Expected:** Both layers should agree on the maximum, or the route should use the reconciliation constant.

## Root Cause

Constants were defined independently in each layer without sharing a single source of truth.

## Impact

- Operational confusion when running reconciliation with `limit=750` and only 500 results appear
- No data loss or corruption — just misleading behavior

## Fix

Either:
1. Import and use the reconciliation `MAX_LIMIT` in the route handler
2. Or reduce route `MAX_LIMIT` to match (500)

## Verification

- [ ] Both limits consistent
- [ ] Unit test verifying limit clamping behavior

## Related

- `app/api/cron/reconcile-stripe-subscriptions/route.ts:9`
- `src/adapters/jobs/reconcile-stripe-subscriptions.ts`
