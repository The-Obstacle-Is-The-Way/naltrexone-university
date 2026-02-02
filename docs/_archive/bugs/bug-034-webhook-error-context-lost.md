# BUG-034: Webhook Catch Block Loses Error Context

**Status:** Resolved
**Priority:** P2 - Medium
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary
The Stripe webhook signature verification catch block discarded the original error, making it difficult to debug webhook failures.

## Location
- `src/adapters/gateways/stripe-payment-gateway.ts:178-189`

## Root Cause
The catch block used `catch { ... }` without capturing the error variable, losing context about why verification failed.

## Fix
1. Added optional `logger` to `StripePaymentGatewayDeps` type
2. Capture error in catch block
3. Include original message in `ApplicationError`
4. Call `logger.error` when logger is provided

**stripe-payment-gateway.ts:**
```typescript
export type StripePaymentGatewayDeps = {
  stripe: StripeClient;
  webhookSecret: string;
  priceIds: StripePriceIds;
  logger?: { error: (msg: string, context?: Record<string, unknown>) => void };
};

// In processWebhookEvent:
} catch (error) {
  const errorMessage =
    error instanceof Error ? error.message : 'Unknown error';

  this.deps.logger?.error('Webhook signature verification failed', {
    error: errorMessage,
  });

  throw new ApplicationError(
    'INVALID_WEBHOOK_SIGNATURE',
    `Invalid webhook signature: ${errorMessage}`,
  );
}
```

**lib/container.ts:**
```typescript
createPaymentGateway: () =>
  new StripePaymentGateway({
    stripe: primitives.stripe,
    webhookSecret: primitives.env.STRIPE_WEBHOOK_SECRET,
    priceIds: stripePriceIds,
    logger: primitives.logger,  // Injected
  }),
```

## Verification
- [x] Unit tests added (`stripe-payment-gateway.test.ts`)
  - Error message includes original Stripe error
  - Logger.error called when logger provided
- [x] TypeScript compilation passes
- [x] Build succeeds

## Related
- BUG-015: Fragile webhook error matching (archived, used error code instead of string)
