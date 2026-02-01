# SPEC-009: Payment Gateway (Stripe)

**Status:** Ready
**Layer:** Adapters
**Dependencies:** SPEC-004 (Ports), SPEC-006 (Drizzle Schema)
**Implements:** ADR-005 (Payment Boundary)

---

## Objective

Implement `PaymentGateway` using Stripe while keeping:

- Domain free of Stripe knowledge
- Application ports free of Stripe SDK types

---

## Files to Create

```
src/adapters/gateways/
├── stripe-payment-gateway.ts
└── index.ts
```

---

## Plan ↔ Price Mapping (Required)

Stripe price IDs are configuration. Map them at the adapter boundary:

- Monthly: `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`
- Annual: `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL`

The mapping is **the only place** where those price IDs appear.

---

## Checkout Session Creation

`createCheckoutSession()` MUST:

- Use `mode: 'subscription'`
- Use an existing Stripe customer id (created upstream if needed)
- Use the mapped price id for the selected domain plan
- Set subscription metadata:
  - `user_id = <internal user uuid>`

If Stripe does not return a `session.url`, throw `ApplicationError('STRIPE_ERROR')` in the controller/use case layer.

---

## Webhook Processing

`processWebhookEvent(rawBody, signature)` MUST:

1. Verify signature using `stripe.webhooks.constructEvent`
2. Normalize the event into `WebhookEventResult` (SPEC-004)
3. Include:
   - `eventId`
   - `type`
   - `processed` flag
   - `subscriptionUpdate` when the event represents a subscription state change

**Events handled (minimum):**

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

**User mapping rule:**

- The internal `userId` must come from Stripe metadata (`subscription_data.metadata.user_id`), not from email.

**Subscription update extraction (required):**

- For subscription events, `subscriptionUpdate` MUST include:
  - `userId` (internal UUID from metadata)
  - `status`
  - `currentPeriodEnd`
  - `cancelAtPeriodEnd`
  - `priceId` (persisted for audit/debug; not a domain concept)

If required fields are missing (e.g., no `user_id` metadata), treat this as a processing error and let the webhook/controller mark the event as failed (do not silently ignore).

---

## Stripe API Version Pinning

Pin Stripe API version explicitly (do not float):

- Use the Stripe SDK’s built-in `Stripe.API_VERSION` constant (from the installed `stripe` package), or
- Set an explicit version string and update it intentionally when bumping `stripe`.

---

## Testing

Gateway tests are unit tests:

- Inject a fake Stripe client
- No network calls
- Verify that:
  - `constructEvent` is used for signature verification
  - Correct Stripe parameters are passed for checkout/portal session creation

Idempotency behavior is NOT owned by this gateway (it is implemented via `stripe_events` persistence + controller/use case logic per `docs/specs/master_spec.md` Section 4.4.2).

**Required test file:**

- `src/adapters/gateways/stripe-payment-gateway.test.ts`

---

## Definition of Done

- `PaymentGateway` is implemented without leaking Stripe SDK types into domain/application layers.
- Plan → price ID mapping is the only place where price IDs appear in application code.
- Gateway is unit-tested without network calls.
