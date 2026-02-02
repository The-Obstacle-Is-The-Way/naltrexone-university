# BUG-033: Webhook Catch Block Loses Error Context

## Severity: P2 - Medium

## Summary
The Stripe webhook signature verification catch block discards the original error, making it difficult to debug webhook failures.

## Location
- `src/adapters/gateways/stripe-payment-gateway.ts:178`

## Current Behavior
```typescript
try {
  event = this.deps.stripe.webhooks.constructEvent(
    rawBody,
    signature,
    this.deps.webhookSecret,
  );
} catch {  // ← no error variable captured
  throw new ApplicationError('STRIPE_ERROR', 'Invalid webhook signature');
}
```

The original Stripe error (which contains useful details like "timestamp too old" or "signature mismatch") is discarded.

## Expected Behavior
Capture and include the original error context:
```typescript
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  throw new ApplicationError(
    'STRIPE_ERROR',
    `Invalid webhook signature: ${message}`,
  );
}
```

## Impact
- **Debugging difficulty:** When webhooks fail, logs only show generic message
- **Extended troubleshooting:** Developers can't distinguish between:
  - Timestamp drift
  - Wrong webhook secret
  - Malformed payload
  - Replay attack detection
- **Production incidents:** Harder to diagnose webhook failures

## Common Stripe Verification Errors
1. `No signatures found matching the expected signature for payload`
2. `Timestamp outside the tolerance zone`
3. `Unexpected token in JSON`
4. `Missing stripe-signature header`

All of these become just "Invalid webhook signature" in the current implementation.

## Recommended Fix
```typescript
} catch (error) {
  const originalMessage = error instanceof Error
    ? error.message
    : String(error);

  // Log full error for debugging
  this.deps.logger?.error({ error }, 'Webhook signature verification failed');

  throw new ApplicationError(
    'STRIPE_ERROR',
    `Invalid webhook signature: ${originalMessage}`,
  );
}
```

## Related
- BUG-014: Fragile webhook error matching (depends on this message)
- DEBT-039: Webhook error context loss (duplicate/related)
- DEBT-057: Webhook error stack trace lost
