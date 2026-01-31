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

```
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

The domain uses `SubscriptionPlan` (monthly/annual). The adapter maps these to vendor-specific price IDs:

```typescript
// src/adapters/config/plan-price-mapping.ts
import { SubscriptionPlan } from '@/domain/value-objects';

/**
 * Maps domain plans to Stripe price IDs.
 * This is the ONLY place where Stripe price IDs appear.
 */
export const PLAN_TO_PRICE_ID: Record<SubscriptionPlan, string> = {
  [SubscriptionPlan.Monthly]: process.env.STRIPE_PRICE_MONTHLY!,
  [SubscriptionPlan.Annual]: process.env.STRIPE_PRICE_ANNUAL!,
};

export const PRICE_ID_TO_PLAN: Record<string, SubscriptionPlan> = {
  [process.env.STRIPE_PRICE_MONTHLY!]: SubscriptionPlan.Monthly,
  [process.env.STRIPE_PRICE_ANNUAL!]: SubscriptionPlan.Annual,
};
```

### Payment Gateway Interface (Application Layer)

```typescript
// src/application/ports/gateways.ts
import type { SubscriptionPlan } from '@/domain/value-objects';

export type CheckoutSessionInput = {
  userId: string;
  userEmail: string;
  plan: SubscriptionPlan;  // Domain concept, NOT vendor price ID
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSessionOutput = {
  url: string;
};

export type PortalSessionInput = {
  customerId: string;  // Our internal reference to external customer
  returnUrl: string;
};

export type PortalSessionOutput = {
  url: string;
};

export type WebhookEventResult = {
  processed: boolean;
  subscriptionUpdate?: {
    userId: string;
    status: SubscriptionStatus;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  };
};

/**
 * Payment gateway interface.
 * Defined in application layer, implemented in adapters.
 */
export interface PaymentGateway {
  /**
   * Create a checkout session for new subscription.
   */
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionOutput>;

  /**
   * Create a portal session for managing existing subscription.
   */
  createPortalSession(input: PortalSessionInput): Promise<PortalSessionOutput>;

  /**
   * Process a webhook event.
   * Returns subscription state change if applicable.
   */
  processWebhookEvent(
    rawBody: string,
    signature: string
  ): Promise<WebhookEventResult>;
}
```

### Subscription Repository Interface (Application Layer)

```typescript
// src/application/ports/repositories.ts

export interface SubscriptionRepository {
  findByUserId(userId: string): Promise<Subscription | null>;

  save(subscription: Subscription): Promise<Subscription>;

  update(
    userId: string,
    updates: Partial<Pick<Subscription, 'status' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'>>
  ): Promise<Subscription>;
}

export interface PaymentCustomerRepository {
  findByUserId(userId: string): Promise<{ customerId: string } | null>;

  save(userId: string, customerId: string): Promise<void>;
}
```

### Stripe Payment Gateway Implementation (Adapters Layer)

```typescript
// src/adapters/gateways/stripe-payment-gateway.ts
import Stripe from 'stripe';
import type { PaymentGateway, CheckoutSessionInput, WebhookEventResult } from '@/application/ports/gateways';
import { SubscriptionStatus } from '@/domain/value-objects';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
});

export class StripePaymentGateway implements PaymentGateway {
  async createCheckoutSession(input: CheckoutSessionInput) {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: input.userEmail,
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.userId,
      subscription_data: {
        metadata: { user_id: input.userId },
      },
    });

    if (!session.url) {
      throw new Error('Stripe did not return checkout URL');
    }

    return { url: session.url };
  }

  async createPortalSession(input: PortalSessionInput) {
    const session = await stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });

    return { url: session.url };
  }

  async processWebhookEvent(
    rawBody: string,
    signature: string
  ): Promise<WebhookEventResult> {
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        return this.handleSubscriptionChange(event.data.object as Stripe.Subscription);

      case 'customer.subscription.deleted':
        return this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);

      default:
        return { processed: false };
    }
  }

  private handleSubscriptionChange(sub: Stripe.Subscription): WebhookEventResult {
    const userId = sub.metadata?.user_id;
    if (!userId) {
      throw new Error('Subscription missing user_id metadata');
    }

    return {
      processed: true,
      subscriptionUpdate: {
        userId,
        status: this.mapStatus(sub.status),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
    };
  }

  private handleSubscriptionDeleted(sub: Stripe.Subscription): WebhookEventResult {
    const userId = sub.metadata?.user_id;
    if (!userId) {
      return { processed: false };
    }

    return {
      processed: true,
      subscriptionUpdate: {
        userId,
        status: SubscriptionStatus.Canceled,
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: true,
      },
    };
  }

  private mapStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
    const mapping: Record<string, SubscriptionStatus> = {
      'incomplete': SubscriptionStatus.Incomplete,
      'incomplete_expired': SubscriptionStatus.IncompleteExpired,
      'trialing': SubscriptionStatus.Trialing,
      'active': SubscriptionStatus.Active,
      'past_due': SubscriptionStatus.PastDue,
      'canceled': SubscriptionStatus.Canceled,
      'unpaid': SubscriptionStatus.Unpaid,
      'paused': SubscriptionStatus.Paused,
    };
    return mapping[stripeStatus] ?? SubscriptionStatus.Incomplete;
  }
}
```

### Check Entitlement Use Case (Application Layer)

```typescript
// src/application/use-cases/check-entitlement.ts
import type { SubscriptionRepository } from '../ports/repositories';
import { isEntitled } from '@/domain/services/entitlement';

export type CheckEntitlementInput = {
  userId: string;
};

export type CheckEntitlementOutput = {
  isEntitled: boolean;
  subscription: {
    status: SubscriptionStatus;
    currentPeriodEnd: Date;
  } | null;
};

export class CheckEntitlementUseCase {
  constructor(private subscriptions: SubscriptionRepository) {}

  async execute(input: CheckEntitlementInput): Promise<CheckEntitlementOutput> {
    const subscription = await this.subscriptions.findByUserId(input.userId);

    const entitled = isEntitled(subscription);

    return {
      isEntitled: entitled,
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }
        : null,
    };
  }
}
```

### Webhook Route Handler (Frameworks Layer)

```typescript
// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { StripePaymentGateway } from '@/adapters/gateways/stripe-payment-gateway';
import { DrizzleSubscriptionRepository } from '@/adapters/repositories';

export const runtime = 'nodejs';

const paymentGateway = new StripePaymentGateway();
const subscriptionRepo = new DrizzleSubscriptionRepository();

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  try {
    const result = await paymentGateway.processWebhookEvent(body, signature);

    if (result.processed && result.subscriptionUpdate) {
      // Update our database
      await subscriptionRepo.update(
        result.subscriptionUpdate.userId,
        {
          status: result.subscriptionUpdate.status,
          currentPeriodEnd: result.subscriptionUpdate.currentPeriodEnd,
          cancelAtPeriodEnd: result.subscriptionUpdate.cancelAtPeriodEnd,
        }
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 400 });
  }
}
```

### Domain Entitlement Logic

```typescript
// src/domain/services/entitlement.ts
import type { Subscription } from '../entities';
import { SubscriptionStatus, EntitledStatuses } from '../value-objects';

/**
 * Determine if a subscription grants access.
 *
 * This is DOMAIN LOGIC - pure function, no dependencies.
 * Stripe doesn't exist here.
 */
export function isEntitled(
  subscription: Subscription | null,
  now: Date = new Date()
): boolean {
  // No subscription = no access
  if (!subscription) {
    return false;
  }

  // Only certain statuses grant access
  if (!EntitledStatuses.includes(subscription.status)) {
    return false;
  }

  // Must not be past period end
  if (subscription.currentPeriodEnd <= now) {
    return false;
  }

  return true;
}
```

### Status Mapping

```
Stripe Status              Domain Status           Entitled?
─────────────              ─────────────           ─────────
active                 =>  Active                  YES
trialing               =>  Trialing                YES
past_due               =>  PastDue                 NO
canceled               =>  Canceled                NO
unpaid                 =>  Unpaid                  NO
incomplete             =>  Incomplete              NO
incomplete_expired     =>  IncompleteExpired       NO
paused                 =>  Paused                  NO
```

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
- [ ] `isEntitled()` function has no external dependencies
- [ ] Webhook handler uses gateway interface
- [ ] Status mapping is explicit and complete

## Testing

```typescript
// Domain - pure function test
describe('isEntitled', () => {
  it('returns true for active subscription with future period end', () => {
    const subscription = createSubscription({
      status: SubscriptionStatus.Active,
      currentPeriodEnd: new Date(Date.now() + 86400000),
    });

    expect(isEntitled(subscription)).toBe(true);
  });
});

// Use case - with fake repository
describe('CheckEntitlementUseCase', () => {
  it('returns entitled when user has active subscription', async () => {
    const repo = new FakeSubscriptionRepository([
      createSubscription({ userId: 'user1', status: SubscriptionStatus.Active }),
    ]);

    const useCase = new CheckEntitlementUseCase(repo);
    const result = await useCase.execute({ userId: 'user1' });

    expect(result.isEntitled).toBe(true);
  });
});

// Integration - with real Stripe test mode (optional)
describe('StripePaymentGateway', () => {
  it('creates checkout session', async () => {
    const gateway = new StripePaymentGateway();
    const result = await gateway.createCheckoutSession({
      userId: 'test-user',
      userEmail: 'test@example.com',
      priceId: process.env.TEST_PRICE_ID!,
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
