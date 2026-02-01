# SPEC-011: Paywall (Stripe Subscriptions)

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

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

**SSOT:** `docs/specs/master_spec.md` (SLICE-1 + Sections 4.2, 4.4.2, 4.5.1–4.5.2).

---

## Acceptance Criteria

- Given I am logged in, when I click “Subscribe Monthly/Annual” on `/pricing`, then I’m redirected to Stripe Checkout.
- Given I complete payment, when I return to `/checkout/success`, then my subscription is active in the DB and I can access `/app/dashboard`.
- Given I am subscribed, when I open `/app/billing`, then I can open Stripe Customer Portal.
- Given my subscription is canceled/deleted, when webhooks arrive, then my entitlement is removed and `/app/*` redirects to `/pricing`.

---

## Test Cases

- `tests/integration/actions.stripe.integration.test.ts`: verify checkout session creation (Stripe mocked at the boundary).
- `tests/e2e/subscribe.spec.ts`: end-to-end checkout in Stripe **test mode** using test card `4242 4242 4242 4242`.

---

## Implementation Checklist (Ordered)

1. Create Stripe products/prices (see master spec Section 11).
2. Initialize Stripe SDK in `lib/stripe.ts` (server-only, pinned API version).
3. Implement server actions (controllers): `createCheckoutSession(plan)`, `createPortalSession()`.
4. Implement webhook handler `/api/stripe/webhook` with:
   - signature verification
   - Node runtime
   - idempotency via `stripe_events`
5. Implement `/checkout/success` page:
   - reads `session_id`
   - fetches checkout session from Stripe
   - syncs subscription/customer into DB (same logic as webhook; idempotent)
   - redirects to `/app/dashboard`
6. Implement subscription enforcement in `app/(app)/app/layout.tsx` server component:
   - if not entitled: redirect to `/pricing`
7. Build `/app/billing` page showing status + portal link.

---

## Files to Create/Modify

- `app/api/stripe/webhook/route.ts`
- `src/adapters/controllers/billing-controller.ts`
- `src/adapters/gateways/stripe-payment-gateway.ts`
- `src/adapters/repositories/drizzle-subscription-repository.ts`
- `src/application/use-cases/create-checkout-session.ts`
- `src/application/use-cases/create-portal-session.ts`
- `src/application/use-cases/check-entitlement.ts`
- `src/domain/services/entitlement.ts`
- `app/(marketing)/checkout/success/page.tsx`
- `app/(app)/app/layout.tsx`
- `app/(app)/app/billing/page.tsx`
- `lib/stripe.ts`, `lib/container.ts` (updated)

---

## Required Environment Variables

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`
- `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL`

---

## Non-Negotiable Requirements

- **No Stripe knowledge in domain:** domain uses `SubscriptionPlan` + `SubscriptionStatus`, never Stripe IDs.
- **Plan input is vendor-agnostic:** controllers accept a domain plan (`monthly|annual`), derive the Stripe price ID from env, and never trust client-sent price IDs.
- **Webhook security:** signature verification with `stripe.webhooks.constructEvent`.
- **Webhook runtime:** Node runtime (not Edge) for raw body + Stripe libs.
- **Webhook idempotency:** `stripe_events` is the only source of truth for “processed or not”.
- **User identity mapping:** internal `userId` comes from Stripe metadata (`user_id`), not from email.
- **No silent failures:** every Stripe-side change must be observable via DB state (`stripe_customers`, `stripe_subscriptions`, `stripe_events`).

---

## Gotchas / Edge Cases

- Always read webhook body as raw text and verify the signature before parsing JSON.
- Expect duplicate webhook deliveries and out-of-order arrivals; idempotency must handle both safely.
- Process the same state transition from multiple sources (webhook + success page) **idempotently**.
- Keep integration tests offline: mock Stripe at the gateway boundary; use E2E for real Stripe test-mode flow.

---

## Demo (Manual)

Once implemented:

1. Set required env vars (Clerk + Stripe + DB + price IDs).
2. `pnpm db:migrate` (fresh DB) and `pnpm dev`.
3. Sign in, open `/pricing`, click subscribe monthly/annual → verify redirect to Stripe checkout.
4. Complete checkout in Stripe test mode → verify redirect to `/checkout/success` then `/app/dashboard`.
5. Visit `/app/billing` → open customer portal → return to `/app/billing`.
6. Cancel subscription in Stripe test mode → wait for webhooks → verify `/app/*` redirects to `/pricing`.

---

## Definition of Done

- Webhook events update `stripe_customers` + `stripe_subscriptions`.
- Unsubscribed users cannot access `/app/*`.
- Subscribed users can access `/app/*`.
- Customer Portal opens and returns to `/app/billing`.
