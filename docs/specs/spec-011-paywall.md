# SPEC-011: Paywall (Stripe Subscriptions)

**Status:** Ready
**Slice:** SLICE-1 (Paywall)
**Depends On:** SLICE-0 (Foundation)
**Implements:** ADR-004, ADR-005, ADR-006, ADR-011

---

## Objective

Implement the subscription paywall end-to-end:

- Pricing → Stripe Checkout
- Stripe webhooks → DB subscription state
- Server-side entitlement gate for `/app/*`
- Billing page → Stripe Customer Portal

This spec is intentionally **DRY**: the **exact** behavior and file list live in `docs/specs/master_spec.md` (SLICE-1 + Sections 4.2, 4.4, 4.5.1–4.5.2).

---

## Source of Truth

- `docs/specs/master_spec.md`:
  - Section 4.2 (entitlement logic)
  - Section 4.4.2 (webhook idempotency via `stripe_events`)
  - Sections 4.5.1–4.5.2 (billing server actions)
  - SLICE-1 (full acceptance criteria + implementation checklist)
- Contracts:
  - `docs/specs/spec-004-application-ports.md` (`PaymentGateway`, repositories)
  - `docs/specs/spec-009-payment-gateway.md` (Stripe adapter rules)
  - `docs/specs/spec-010-server-actions.md` (`ActionResult<T>`)

---

## Non-Negotiable Requirements

- **No Stripe knowledge in domain:** domain uses `SubscriptionPlan` + `SubscriptionStatus`, never Stripe IDs.
- **Webhook security:** signature verification with `stripe.webhooks.constructEvent`.
- **Webhook runtime:** Node runtime (not Edge) for raw body + Stripe libs.
- **Webhook idempotency:** `stripe_events` table is the only source of truth for “processed or not”.
- **User identity mapping:** internal `userId` comes from Stripe metadata (`user_id`), not from email.
- **No silent failures:** every Stripe-side change must be observable via DB state (`stripe_customers`, `stripe_subscriptions`, `stripe_events`).

---

## Gotchas (Save Yourself Later)

- Always read webhook body as raw text and verify the signature before parsing JSON.
- Process the same state transition from multiple sources (webhook + success page) **idempotently**.
- Never trust client-sent price IDs; controllers accept a domain plan and map to env price IDs at the adapter boundary.
- Keep integration tests offline: mock the Stripe boundary (PaymentGateway). Use E2E for the real Stripe test-mode flow.

---

## Definition of Done

- Paywall behavior matches SLICE-1 in `docs/specs/master_spec.md`.
- Webhook processing is idempotent and safe to replay.
- `/app/*` is gated server-side by entitlement (no client-only gates).
