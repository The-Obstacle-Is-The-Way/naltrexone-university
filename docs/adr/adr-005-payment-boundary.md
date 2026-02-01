# ADR-005: Payment Boundary

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture Layers), ADR-002 (Domain Model)

---

## Context

We need to handle subscription payments via Stripe. The challenge is:

1. Stripe is a **framework concern** (outermost layer)
2. Our **domain** should know about subscriptions, not Stripe
3. Webhook handling involves external signatures and event formats
4. We want to test subscription logic without hitting Stripe

## Decision

### The Boundary

Payment processing lives in the **Frameworks & Drivers** layer. Our domain deals with `Subscription` entities with business-meaningful statuses.

```text
┌──────────────────────────────────────────────────────────────┐
│                    FRAMEWORKS (Stripe)                        │
│                                                               │
│   /api/stripe/webhook ──> signature verification             │
│   Stripe SDK ──> checkout sessions, portal sessions          │
│                                                               │
│   ┌──────────────────────────────────────────────────────┐   │
│   │              ADAPTERS (Payment Gateway)               │   │
│   │                                                       │   │
│   │   StripePaymentGateway implements PaymentGateway     │   │
│   │   - createCheckoutSession()                          │   │
│   │   - createPortalSession()                            │   │
│   │   - handleWebhookEvent()                             │   │
│   │                                                       │   │
│   │   Maps Stripe events → Domain subscription updates   │   │
│   │                                                       │   │
│   │   ┌──────────────────────────────────────────────┐   │   │
│   │   │              USE CASES                        │   │   │
│   │   │                                               │   │   │
│   │   │   CheckEntitlementUseCase                    │   │   │
│   │   │   Input: userId                              │   │   │
│   │   │   Output: { isEntitled: boolean }            │   │   │
│   │   │                                               │   │   │
│   │   │   ┌──────────────────────────────────────┐   │   │   │
│   │   │   │           DOMAIN                      │   │   │   │
│   │   │   │                                       │   │   │   │
│   │   │   │   Subscription entity                │   │   │   │
│   │   │   │   isEntitled() pure function         │   │   │   │
│   │   │   │   No Stripe types                    │   │   │   │
│   │   │   └──────────────────────────────────────┘   │   │   │
│   │   └──────────────────────────────────────────────┘   │   │
│   └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Plan Mapping (Adapter Configuration)

The domain uses `SubscriptionPlan` (`monthly` / `annual`). Stripe price IDs are configuration and are mapped at the adapter boundary.

- Stripe price IDs are stored in env (currently `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY` / `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL`).
- The mapping between plan ↔ price ID lives in adapters (see `docs/specs/spec-009-payment-gateway.md`).
- Price IDs may be persisted in `stripe_subscriptions.price_id` for audit/debug, but they MUST NOT appear in domain entities.

### Stripe Customer Mapping (1:1)

We persist a **one-to-one** mapping between internal users and Stripe customers in `stripe_customers`:

- One internal user → one Stripe customer id (unique by `user_id`)
- One Stripe customer id → one internal user (unique by `stripe_customer_id`)

This keeps Stripe identifiers out of the domain model while still supporting idempotent billing flows.

### Payment Ports and Implementations (SSOT)

To avoid drift, the canonical interfaces and implementation guidance live in:

- `docs/specs/spec-004-application-ports.md` (`PaymentGateway`, repositories)
- `docs/specs/spec-009-payment-gateway.md` (Stripe adapter rules)
- `docs/specs/master_spec.md` Section 4.4.2 (webhook idempotency via `stripe_events`)

This ADR records the boundary decision; specs above define the exact contracts and behaviors.

## Consequences

### Positive

1. **Swappable Payment Provider** — Replace Stripe with Paddle, LemonSqueezy, etc.
2. **Testable Entitlement** — `isEntitled()` is a pure function, trivially testable
3. **Clean Domain** — No Stripe types leak into business logic
4. **Webhook Isolation** — Webhook handling is adapter concern

### Negative

1. **Mapping Complexity** — Must map Stripe types to domain types
2. **Event Processing** — Need to handle Stripe's event structure

### Mitigations

- Comprehensive mapping in gateway
- Webhook event logging for debugging
- Idempotent event processing

## Compliance Checklist

- [ ] No Stripe imports in `src/domain/`
- [ ] No Stripe imports in `src/application/`
- [ ] Domain Subscription entity has NO `stripeSubscriptionId` or `priceId` fields
- [ ] Domain uses `SubscriptionPlan` (monthly/annual), NOT Stripe price IDs
- [ ] Plan-to-price mapping exists ONLY in `src/adapters/config/`
- [ ] API/UI never sends raw `priceId` — only domain `plan` values
- [ ] `src/domain/services/isEntitled()` is a pure function (no external dependencies)
- [ ] Webhook handler uses gateway interface
- [ ] Webhook processing is idempotent via StripeEventRepository (`stripe_events`)
- [ ] Status mapping is explicit and complete

> **Implementation note:** Gateway adapters (AuthGateway/PaymentGateway) are tracked as DEBT-005 and are not yet implemented in this baseline.

## Testing

```typescript
// Domain - pure function test
describe('isEntitled', () => {
  it('returns true for active subscription with future period end', () => {
    const subscription = createSubscription({
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 86400000),
    });

    expect(isEntitled(subscription)).toBe(true);
  });
});

// Use case - with fake repository
describe('CheckEntitlementUseCase', () => {
  it('returns entitled when user has active subscription', async () => {
    const repo = new FakeSubscriptionRepository([
      createSubscription({ userId: 'user1', status: 'active' }),
    ]);

    const useCase = new CheckEntitlementUseCase(repo);
    const result = await useCase.execute({ userId: 'user1' });

    expect(result.isEntitled).toBe(true);
  });
});

// Repository - idempotency behavior (stripe_events)
describe('StripeEventRepository', () => {
  it('treats already-processed events as processed', async () => {
    const repo = new FakeStripeEventRepository();
    await repo.ensure('evt_123', 'customer.subscription.updated');
    await repo.markProcessed('evt_123');
    expect(await repo.isProcessed('evt_123')).toBe(true);
  });
});

// Integration - with real Stripe test mode (optional)
describe('StripePaymentGateway', () => {
  it('creates checkout session with domain plan', async () => {
    const gateway = new StripePaymentGateway();
    const result = await gateway.createCheckoutSession({
      userId: 'test-user',
      userEmail: 'test@example.com',
      plan: 'monthly', // Domain plan, NOT price ID
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });

    expect(result.url).toContain('checkout.stripe.com');
  });
});
```

## References

- Stripe API Documentation
- Stripe Webhook Best Practices
- Clean Architecture, Chapter 26: The Main Component
