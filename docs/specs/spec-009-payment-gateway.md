# SPEC-009: Payment Gateway (Stripe)

**Status:** Ready
**Layer:** Adapters
**Dependencies:** SPEC-004 (Ports)
**Implements:** ADR-001, ADR-005

---

## Objective

Implement the `PaymentGateway` interface using Stripe. This adapter bridges the Application layer's payment abstraction to the concrete Stripe SDK.

---

## Files to Create

```
src/adapters/gateways/
├── stripe-payment-gateway.ts
├── stripe-payment-gateway.test.ts
└── (index.ts - updated)
```

---

## Design Pattern: Adapter

```
┌─────────────────────────────────────────────────┐
│         APPLICATION LAYER (ports)               │
│                                                 │
│   PaymentGateway (interface)                    │
│   - createCheckoutSession()                     │
│   - createPortalSession()                       │
│   - constructWebhookEvent()                     │
│                                                 │
└─────────────────────────────────────────────────┘
                    ▲
                    │ implements
                    │
┌─────────────────────────────────────────────────┐
│         ADAPTERS LAYER                          │
│                                                 │
│   StripePaymentGateway                          │
│   - wraps Stripe SDK                            │
│   - maps domain types ↔ Stripe types            │
│   - handles webhook signature verification      │
│                                                 │
└─────────────────────────────────────────────────┘
                    │
                    │ uses
                    ▼
┌─────────────────────────────────────────────────┐
│         EXTERNAL SERVICES                       │
│                                                 │
│   Stripe SDK                                    │
│   - stripe.checkout.sessions.create()           │
│   - stripe.billingPortal.sessions.create()      │
│   - stripe.webhooks.constructEvent()            │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Test Strategy

PaymentGateway tests use a **Fake** Stripe client (per ADR-003). We inject a fake implementation that mimics Stripe responses without network calls.

---

## Test First

### File: `src/adapters/gateways/stripe-payment-gateway.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { StripePaymentGateway } from './stripe-payment-gateway';
import type { CreateCheckoutInput, CreatePortalInput } from '@/src/application/ports';

// Fake Stripe client for testing
class FakeStripeClient {
  checkout = {
    sessions: {
      create: async (params: any) => ({
        id: 'cs_test_123',
        url: `https://checkout.stripe.com/c/pay/cs_test_123`,
      }),
    },
  };

  billingPortal = {
    sessions: {
      create: async (params: any) => ({
        id: 'bps_test_123',
        url: `https://billing.stripe.com/session/bps_test_123`,
      }),
    },
  };

  webhooks = {
    constructEvent: (payload: string, signature: string, secret: string) => {
      if (signature === 'invalid') {
        throw new Error('Invalid signature');
      }
      return JSON.parse(payload);
    },
  };
}

describe('StripePaymentGateway', () => {
  let fakeStripe: FakeStripeClient;
  let gateway: StripePaymentGateway;

  beforeEach(() => {
    fakeStripe = new FakeStripeClient();
    gateway = new StripePaymentGateway(fakeStripe as any, 'whsec_test');
  });

  describe('createCheckoutSession', () => {
    it('creates checkout session with correct parameters', async () => {
      const input: CreateCheckoutInput = {
        userId: 'user_123',
        email: 'test@example.com',
        priceId: 'price_monthly',
        successUrl: 'https://app.com/success',
        cancelUrl: 'https://app.com/cancel',
      };

      const result = await gateway.createCheckoutSession(input);

      expect(result.url).toContain('https://checkout.stripe.com');
    });

    it('returns checkout URL', async () => {
      const input: CreateCheckoutInput = {
        userId: 'user_123',
        email: 'test@example.com',
        priceId: 'price_monthly',
        successUrl: 'https://app.com/success',
        cancelUrl: 'https://app.com/cancel',
      };

      const result = await gateway.createCheckoutSession(input);

      expect(result.url).toBeDefined();
      expect(typeof result.url).toBe('string');
    });
  });

  describe('createPortalSession', () => {
    it('creates billing portal session', async () => {
      const input: CreatePortalInput = {
        customerId: 'cus_test_123',
        returnUrl: 'https://app.com/settings',
      };

      const result = await gateway.createPortalSession(input);

      expect(result.url).toContain('https://billing.stripe.com');
    });
  });

  describe('constructWebhookEvent', () => {
    it('parses valid webhook payload', async () => {
      const payload = JSON.stringify({
        id: 'evt_123',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_123' } },
      });

      const event = await gateway.constructWebhookEvent(payload, 'valid_sig');

      expect(event.id).toBe('evt_123');
      expect(event.type).toBe('checkout.session.completed');
    });

    it('throws on invalid signature', async () => {
      const payload = JSON.stringify({ id: 'evt_123', type: 'test' });

      await expect(
        gateway.constructWebhookEvent(payload, 'invalid')
      ).rejects.toThrow('Invalid signature');
    });
  });
});
```

---

## Implementation

### File: `src/adapters/gateways/stripe-payment-gateway.ts`

```typescript
import Stripe from 'stripe';
import type {
  PaymentGateway,
  CreateCheckoutInput,
  CreatePortalInput,
  CheckoutSessionResult,
  PortalSessionResult,
  WebhookEvent,
} from '@/src/application/ports';

/**
 * Stripe implementation of PaymentGateway
 */
export class StripePaymentGateway implements PaymentGateway {
  constructor(
    private readonly stripe: Stripe,
    private readonly webhookSecret: string
  ) {}

  /**
   * Create a Stripe Checkout session for subscription
   */
  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSessionResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: input.email,
      client_reference_id: input.userId,
      line_items: [
        {
          price: input.priceId,
          quantity: 1,
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: {
        userId: input.userId,
      },
    });

    if (!session.url) {
      throw new Error('Failed to create checkout session URL');
    }

    return { url: session.url };
  }

  /**
   * Create a Stripe Billing Portal session
   */
  async createPortalSession(input: CreatePortalInput): Promise<PortalSessionResult> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });

    return { url: session.url };
  }

  /**
   * Verify and parse Stripe webhook event
   */
  async constructWebhookEvent(payload: string, signature: string): Promise<WebhookEvent> {
    const event = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret
    );

    return {
      id: event.id,
      type: event.type,
      data: event.data.object,
    };
  }
}

/**
 * Factory function for production use
 */
export function createStripePaymentGateway(): StripePaymentGateway {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2024-12-18.acacia',
  });

  return new StripePaymentGateway(stripe, process.env.STRIPE_WEBHOOK_SECRET!);
}
```

---

## Webhook Handler Pattern

### File: `app/api/stripe/webhook/route.ts` (Reference)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createStripePaymentGateway } from '@/src/adapters/gateways';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const paymentGateway = createStripePaymentGateway();
  const subscriptionRepo = new DrizzleSubscriptionRepository(db);

  try {
    const event = await paymentGateway.constructWebhookEvent(payload, signature);

    switch (event.type) {
      case 'checkout.session.completed':
        // Handle checkout completion
        break;
      case 'customer.subscription.updated':
        // Handle subscription update
        break;
      case 'customer.subscription.deleted':
        // Handle subscription cancellation
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 400 });
  }
}
```

---

## Environment Variables

```env
# .env.example additions
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...
```

---

## Quality Gate

```bash
pnpm test src/adapters/gateways/stripe-payment-gateway.test.ts
```

---

## Definition of Done

- [ ] StripePaymentGateway implements PaymentGateway interface
- [ ] Checkout session creation works
- [ ] Billing portal session creation works
- [ ] Webhook signature verification works
- [ ] Testable with fake Stripe client
- [ ] All tests pass without real Stripe calls
- [ ] Factory function for production use
