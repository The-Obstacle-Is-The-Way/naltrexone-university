# ADR-017: Webhook Processing Lifecycle

**Status:** Accepted
**Date:** 2026-02-07
**Decision Makers:** Engineering
**Depends On:** ADR-005 (Payment Boundary), ADR-006 (Error Handling Strategy), ADR-009 (Security Hardening), ADR-014 (Stripe Eager Sync)

---

## Context

Stripe and Clerk deliver events to our application via webhooks. These events drive critical state transitions:

- **Stripe:** Subscription created, updated, deleted, paused, resumed; checkout completed; invoice payment failed.
- **Clerk:** User created, updated, deleted.

Webhook processing has inherent challenges:

1. **Ordering is not guaranteed.** Stripe may deliver `subscription.updated` before `checkout.session.completed`.
2. **Delivery is at-least-once.** The same event can arrive multiple times.
3. **Payloads must be verified.** Unverified payloads could allow attackers to forge subscription state.
4. **Failures must not lose events.** A 500 response triggers Stripe/Clerk retries, but persistent failures can exhaust retry budgets.
5. **Internal errors must not leak.** Error responses should be generic (ADR-009).

---

## Decision

### 1. Signature Verification

Every webhook request is verified before any processing:

- **Stripe:** `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)` verifies the HMAC-SHA256 signature against the raw request body.
- **Clerk:** Svix signature verification via Clerk's SDK.

Invalid signatures throw `ApplicationError('INVALID_WEBHOOK_SIGNATURE')` and return a generic 400 response.

### 2. Payload Validation with Zod

After signature verification, payloads are validated against Zod schemas defined in `src/adapters/gateways/stripe/stripe-webhook-schemas.ts`:

- `stripeSubscriptionSchema` — Validates subscription objects (id, customer, status, items, metadata).
- `stripeEventWithSubscriptionRefSchema` — Validates checkout/invoice events that reference a subscription.
- `.passthrough()` on all schemas — Allows Stripe to add new fields without breaking validation.

Invalid payloads throw `ApplicationError('INVALID_WEBHOOK_PAYLOAD')` with structured error logging.

### 3. Event Type Routing

The webhook processor (`stripe-webhook-processor.ts`) routes events by type:

```text
checkout.session.completed   ─┐
checkout.session.expired      │  Subscription-ref events:
invoice.payment_failed        ├→ Extract subscription ref → retrieve full subscription → normalize
invoice.payment_succeeded     │
invoice.payment_action_required┘

customer.subscription.created ─┐
customer.subscription.updated  │  Direct subscription events:
customer.subscription.deleted  ├→ Parse subscription object → normalize
customer.subscription.paused   │
customer.subscription.resumed ─┘

(other event types)           → Return event ID only (no-op, acknowledged)
```

### 4. Subscription Normalization

All subscription data flows through `retrieveAndNormalizeStripeSubscription()`:

- Fetches the **latest** subscription state from the Stripe API (not the webhook payload) to handle out-of-order delivery.
- Maps Stripe subscription status to domain `SubscriptionStatus`.
- Maps Stripe price ID to domain `SubscriptionPlan` (monthly/annual).
- Extracts `user_id` from subscription metadata for internal user mapping.
- Returns a vendor-agnostic `WebhookEventResult.subscriptionUpdate` structure.

### 5. Exactly-Once Processing via `StripeEventRepository`

The `stripe_events` table provides idempotent webhook processing:

```text
1. claim(eventId) — INSERT if missing; returns true if claimed
2. lock(eventId)  — SELECT FOR UPDATE inside transaction
3. Execute business logic (upsert subscription)
4. markProcessed(eventId) — Set processedAt timestamp
   └── on error: markFailed(eventId, error)
```

Duplicate deliveries are detected at step 1 and short-circuited with a 200 response.

### 6. Error Handling

- **Signature failure:** 400 with generic message (no internal details).
- **Payload validation failure:** 400 with generic message; structured error logged server-side.
- **Business logic failure:** 500 triggers Stripe retry; error recorded in `stripe_events.error`.
- **Unknown event types:** 200 (acknowledged but ignored).

### 7. Rate Limiting

Webhook endpoints are rate-limited per-IP (ADR-016):
- Stripe: 1000 requests/minute
- Clerk: 100 requests/minute

---

## Consequences

### Positive

- **Exactly-once semantics** — `stripe_events` claim prevents duplicate processing.
- **Order-independent** — Fetching latest subscription state from Stripe API handles out-of-order delivery.
- **Vendor-agnostic output** — `WebhookEventResult` is a domain-aligned structure; controllers don't see Stripe types.
- **Schema evolution resilient** — `.passthrough()` on Zod schemas tolerates new Stripe fields.
- **Auditable** — Every event is recorded in `stripe_events` with processing status and error details.
- **Secure** — Signature verification + generic error responses + rate limiting.

### Negative

- **Extra Stripe API call** — Each subscription event triggers a `subscriptions.retrieve()` call to get latest state.
- **Table growth** — `stripe_events` grows with every webhook delivery.

### Mitigations

- Stripe API call is cached by Stripe's infrastructure and typically fast (<100ms).
- `pruneProcessedBefore(cutoff, limit)` garbage-collects old event records.
- Event table has indexes on `(event_id)` for fast lookups.

---

## Compliance

- `src/adapters/gateways/stripe-payment-gateway.test.ts` covers webhook event parsing, payload validation failures, and subscription normalization paths used by the Stripe webhook processor.
- `src/adapters/controllers/stripe-webhook-controller.test.ts` covers idempotent processing, error recording, and response codes.
- `tests/integration/controllers.integration.test.ts` verifies end-to-end webhook processing with a real database.

---

## References

- `src/adapters/gateways/stripe/stripe-webhook-processor.ts` — Event routing and normalization
- `src/adapters/gateways/stripe/stripe-webhook-schemas.ts` — Zod validation schemas
- `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts` — Subscription data normalization
- `src/application/ports/stripe-event-repository.ts` — Event idempotency port
- `src/application/ports/gateways.ts` — `WebhookEventResult` type
- `app/api/stripe/webhook/route.ts` — Webhook route handler
- ADR-005 (Payment Boundary) — Stripe isolation strategy
- ADR-014 (Stripe Eager Sync) — Complements webhooks for checkout flow
- ADR-016 (Rate Limiting) — Webhook rate limit configuration
