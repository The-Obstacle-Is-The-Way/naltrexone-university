# DEBT-303: Reconciliation Cancel Loop — Handle Already-Canceled Subscriptions Idempotently

**Priority:** P3
**Created:** 2026-03-11
**Status:** Resolved (PR #201, 2026-03-11)
**Related:** BUG-205 (canonical selection fix, PR #199), DEBT-304

---

## Context

During the BUG-205 code review, CodeRabbit identified a defensive hardening opportunity in the reconciliation job's duplicate cancellation loop (Phase 5 of `reconcile-stripe-subscriptions.ts`).

The cancel loop iterates `duplicateIds` — subscription IDs derived from a `subscriptions.list` snapshot taken earlier in the same job run. If an external actor (Stripe dashboard, the Clerk `user.deleted` cancel path, or another cron run) cancels one of those subscriptions between the list call and the cancel call, `callStripeWithRetry` will receive a non-transient Stripe error (likely Stripe `rawType: 'invalid_request_error'` with `code: 'resource_missing'`) and fail the entire row — even though the canonical subscription was already persisted in Phase 4.

This is a pre-existing race condition, not introduced by BUG-205. It was deferred from PR #199 to avoid scope creep.

---

## Current Behavior

Phase 5 cancel loop (`reconcile-stripe-subscriptions.ts:232-242`):

```typescript
for (const duplicateId of duplicateIds) {
  await callStripeWithRetry({
    operation: 'subscriptions.cancel',
    fn: () =>
      cancelSubscription(duplicateId, {
        idempotencyKey: `reconcile_duplicate_subscription:${duplicateId}`,
      }),
    logger: deps.logger,
  });
}
```

If Stripe returns a non-transient error (e.g., subscription already canceled), `callStripeWithRetry` throws, the row is marked as failed, and remaining duplicates are not canceled.

## Tracer-Bullet Verification

Verified against the current codebase on 2026-03-11:

- Phase 5 still lives at `reconcile-stripe-subscriptions.ts:232-242`.
- `callStripeWithRetry` (`src/adapters/gateways/stripe/stripe-retry.ts`) delegates to `retry(...)`.
- `retry(...)` rethrows immediately when `shouldRetry(error)` returns `false`.
- `isTransientExternalError` (`src/adapters/shared/retry.ts`) only classifies network errors, `429`, and `5xx` as transient.
- Existing retry tests confirm `400` / `404` are non-transient.
- So a Stripe semantic `4xx` such as `StripeInvalidRequestError` with `rawType: 'invalid_request_error'` and `code: 'resource_missing'` would currently fail the reconciliation row.
- The reconciliation test suite already covers generic cancel failure, but does not yet cover the already-canceled / resource-missing success case.

## Expected Behavior

An already-canceled subscription is a success condition for the cancel loop — the goal was to cancel it, and it's canceled. The loop should:

1. Catch Stripe errors indicating the subscription is already canceled or does not exist
2. Log at info/debug level that the subscription was already canceled
3. Continue to the next duplicate
4. Only rethrow for genuinely unexpected Stripe errors

## Recommended Fix

Wrap the `callStripeWithRetry` call in a try-catch inside the cancel loop:

```typescript
for (const duplicateId of duplicateIds) {
  try {
    await callStripeWithRetry({
      operation: 'subscriptions.cancel',
      fn: () =>
        cancelSubscription(duplicateId, {
          idempotencyKey: `reconcile_duplicate_subscription:${duplicateId}`,
        }),
      logger: deps.logger,
    });
  } catch (error) {
    if (isAlreadyCanceledError(error)) {
      deps.logger.info(
        { stripeSubscriptionId: duplicateId },
        'Duplicate subscription already canceled externally',
      );
      continue;
    }
    throw error;
  }
}
```

The `isAlreadyCanceledError` helper should live at the Stripe adapter boundary and inspect Stripe error shape using the same property-access pattern already used by `isTransientExternalError`. For the installed Stripe SDK, prefer `error.rawType === 'invalid_request_error'` (or `error instanceof Stripe.errors.StripeInvalidRequestError`) plus `error.code === 'resource_missing'`, with a message fallback for "already canceled" wording if needed. There is no existing production Stripe semantic-error classifier in `src/` today, so this helper would be the first one.

## Test Plan

1. Add a test: cancel returns `invalid_request_error` / `resource_missing` for one duplicate → loop continues, remaining duplicates are still canceled, row succeeds
2. Add a test: cancel returns a genuinely unexpected error → row fails as before
3. Existing tests remain unchanged

## Risk

P3 because:
- The race window is narrow (seconds between list and cancel within the same cron run)
- Phase 4 persists the canonical subscription before any cancels, so DB state is always consistent
- The failure mode is a row-level failure in the cron report, not data corruption
- A re-run of the cron job would see the subscription as already canceled in the list (non-blocking status) and skip it

## Source

CodeRabbit review on PR #199 (commit `6dd4d778`), second review pass.
