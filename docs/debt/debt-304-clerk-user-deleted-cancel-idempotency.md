# DEBT-304: Clerk `user.deleted` Stripe Cancel Loop — Handle Already-Canceled Subscriptions Idempotently

**Priority:** P2
**Created:** 2026-03-11
**Status:** Open
**Related:** DEBT-303, ADR-017 (Webhook Processing Lifecycle)

---

## Context

Tracer-bullet verification for DEBT-303 found the same Stripe read-then-cancel race in the Clerk deletion flow.

When `processClerkWebhook()` receives `user.deleted`, it looks up the local Stripe customer mapping and calls `cancelStripeCustomerSubscriptions()` before deleting the user row. That canceler iterates a `stripe.subscriptions.list({ status: 'all' })` snapshot and cancels each non-terminal subscription one at a time.

If an external actor cancels or deletes one of those subscriptions between the list call and the cancel call, the retry wrapper treats the resulting Stripe semantic `4xx` as non-transient and throws. The webhook route then returns `500`, and local user deletion does not complete in that delivery attempt.

---

## Current Behavior

The canceler currently does this:

```typescript
for await (const subscription of stripe.subscriptions.list({
  customer: stripeCustomerId,
  status: 'all',
  limit: 100,
})) {
  if (
    subscription.status === 'canceled' ||
    subscription.status === 'incomplete_expired'
  ) {
    continue;
  }

  await retry(
    () =>
      stripe.subscriptions.cancel(subscription.id, {
        idempotencyKey: `cancel_subscription:${subscription.id}`,
      }),
    { ...STRIPE_RETRY_OPTIONS, shouldRetry: isTransientExternalError },
  );
}
```

If Stripe returns an already-canceled / missing-resource error for one listed subscription, the canceler throws, `processClerkWebhook()` stops, and the route responds with `500`.

## Expected Behavior

Already-canceled or missing subscriptions should be treated as a success condition in this loop. The flow should:

1. Catch Stripe errors that mean the subscription is already terminal or missing
2. Log a low-severity informational event with the subscription id
3. Continue canceling any remaining non-terminal subscriptions
4. Proceed with local user deletion once the loop completes
5. Rethrow only for genuinely unexpected Stripe failures

## Recommended Fix

Wrap the per-subscription cancel call in a local try-catch inside `cancelStripeCustomerSubscriptions()`. If DEBT-303 extracts a reusable Stripe semantic-error classifier such as `isAlreadyCanceledError`, reuse it here instead of duplicating the detection logic.

This should remain a Stripe-adapter concern. The Clerk controller should continue to call a single `cancelStripeCustomerSubscriptions()` function and should not learn Stripe SDK error-shape details.

## Test Plan

1. Add a canceler test: one listed subscription returns Stripe `rawType: 'invalid_request_error'` / `code: 'resource_missing'` → the loop continues and remaining subscriptions are still canceled
2. Add a Clerk webhook controller test: `user.deleted` still deletes the local user when one Stripe subscription was already canceled externally
3. Keep the current behavior for unexpected cancel failures: the webhook should still fail and rely on retry

## Risk

P2 because:

- The current failure bubbles to the public Clerk webhook route as a `500`
- Local user cleanup is delayed until Clerk retries the event
- The next retry will often self-heal because the externally canceled subscription will be terminal in the next `subscriptions.list` snapshot
- The issue does not corrupt subscription state, but it can stall account-deletion completion and require retry-driven recovery

## Source

Tracer-bullet verification on 2026-03-11 while validating DEBT-303.
