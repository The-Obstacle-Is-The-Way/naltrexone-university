# ADR-014: Stripe Eager Sync on Checkout Success

**Status:** Accepted
**Date:** 2026-02-02
**Decision Makers:** Engineering
**Depends On:** ADR-005 (Payment Boundary), ADR-006 (Error Handling Strategy)

---

## Context

Stripe subscription state reaches our database via webhooks. Webhooks are reliable but **eventually consistent**:

- Delivery can be delayed by seconds/minutes.
- Delivery can be out-of-order and duplicated.
- The user can return to our app immediately after checkout, before the webhook updates our DB.

That creates a race condition:

1. User completes checkout on Stripe.
2. User is redirected to `/checkout/success`.
3. User is redirected to `/app/dashboard`.
4. The DB may not yet reflect the active subscription, so entitlement checks can temporarily fail.

This is user-visible and increases support burden (“I paid but I’m still locked out”).

---

## Decision

Implement an **eager sync** step on the checkout success page:

- On `/checkout/success`, fetch the Checkout Session (and subscription) from Stripe via the Stripe API.
- Validate that the subscription is associated with the currently authenticated user.
- Upsert the minimal required subscription state (`stripe_customers`, `stripe_subscriptions`) inside a DB transaction.
- Redirect to `/app/dashboard`.

Webhooks remain the source of truth for ongoing subscription lifecycle events (renewals, payment failures, admin actions).

Implementation lives at:

- `app/(marketing)/checkout/success/page.tsx` (`syncCheckoutSuccess`)

---

## Consequences

### Positive

- Eliminates the “user returns before webhook” entitlement race for the happy checkout path.
- Improves UX: subscription state is correct immediately after checkout.
- Keeps domain/application layers vendor-agnostic; Stripe API calls remain at the frameworks/adapters boundary.

### Negative

- Adds extra Stripe API calls (one fetch per successful checkout return).
- Duplicates a subset of webhook upsert logic (must remain consistent).

### Mitigations

- Keep eager sync idempotent and use the same DB upsert shape as webhook processing.
- Webhooks continue to handle non-interactive/async changes.

---

## Compliance

- Unit tests verify eager sync redirects and writes expected DB state.
- Webhook processing remains idempotent and durable.

SSOT alignment:

- `docs/specs/spec-011-paywall.md` describes syncing subscription state on `/checkout/success`.

---

## References

- Stripe: Webhooks are eventually consistent; deliveries are not guaranteed to be immediate and can be retried.
- `docs/specs/spec-011-paywall.md`
- `docs/audits/audit-003-external-integrations.md` (Stripe section)

