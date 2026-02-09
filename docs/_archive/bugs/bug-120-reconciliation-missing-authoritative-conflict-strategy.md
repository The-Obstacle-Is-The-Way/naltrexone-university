# BUG-120: Reconciliation Job Missing Authoritative Conflict Strategy

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-08
**Resolved:** 2026-02-09

---

## Description

The Stripe reconciliation job (`src/adapters/jobs/reconcile-stripe-subscriptions.ts`, line 265) calls `stripeCustomers.insert(canonical.userId, canonical.externalCustomerId)` without passing `{ conflictStrategy: 'authoritative' }`.

If a user's Stripe customer ID has changed (e.g., the customer was re-created in Stripe), the reconciliation job will throw an `ApplicationError('CONFLICT')` and fail for that user, halting reconciliation for the entire batch.

## Affected Files

| File | Line | Issue |
|------|------|-------|
| `src/adapters/jobs/reconcile-stripe-subscriptions.ts` | 265 | Missing `conflictStrategy: 'authoritative'` |

## Comparison

The webhook handler correctly uses the authoritative strategy:

```typescript
// stripe-webhook-controller.ts, line 88
await deps.stripeCustomers.insert(userId, stripeCustomerId, {
  conflictStrategy: 'authoritative',
});
```

But the reconciliation job uses the default (which throws on conflict):

```typescript
// reconcile-stripe-subscriptions.ts, line 265
await stripeCustomers.insert(canonical.userId, canonical.externalCustomerId);
// Missing: { conflictStrategy: 'authoritative' }
```

## Impact

- If a Stripe customer mapping already exists with a different `externalCustomerId`, the reconciliation job throws `CONFLICT`
- The job fails for that user and may stop processing remaining users
- The stale customer mapping persists, potentially causing checkout or portal session failures
- The webhook path handles this correctly, but scheduled reconciliation does not

## Resolution

Add `{ conflictStrategy: 'authoritative' }` to the `insert` call in the reconciliation job:

```typescript
await stripeCustomers.insert(canonical.userId, canonical.externalCustomerId, {
  conflictStrategy: 'authoritative',
});
```

## Verification

- `pnpm typecheck && pnpm test --run`
- Reconciliation job test covers the conflict scenario (stale customer mapping is overwritten)

## Related

- BUG-119 (Stripe status enum — related webhook processing)
