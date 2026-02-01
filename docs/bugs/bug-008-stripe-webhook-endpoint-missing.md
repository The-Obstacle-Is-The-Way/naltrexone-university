# BUG-008: Stripe Webhook Endpoint Missing (`/api/stripe/webhook`)

**Status:** Open
**Priority:** P0
**Date:** 2026-02-01

## Summary

SSOT (master spec + SPEC-011 Paywall) requires a Stripe webhook route handler at `app/api/stripe/webhook/route.ts` to sync Stripe subscription state into Postgres (via `stripe_events`, `stripe_customers`, `stripe_subscriptions`). The route handler does not exist, so Stripe cannot deliver subscription events and the system cannot become “subscription-aware”.

This is a hard blocker for SLICE-1 paywall acceptance criteria (subscribe → checkout success/webhook → DB subscription active → entitlement gate).

## Evidence / Current State

- **Missing file:** `app/api/stripe/webhook/route.ts` (404)
- **Middleware expects it:** `proxy.ts` treats `/api/stripe/webhook(.*)` as a public route (signature-protected)
- **Foundational pieces exist but are unused end-to-end:**
  - `src/adapters/gateways/stripe-payment-gateway.ts` (signature verification + normalization)
  - `src/adapters/repositories/drizzle-stripe-event-repository.ts` (stripe_events)
  - `src/adapters/repositories/drizzle-subscription-repository.ts` (stripe_subscriptions)
  - `src/adapters/repositories/drizzle-stripe-customer-repository.ts` (stripe_customers)

## Impact

- Stripe subscription state will never be persisted/updated from Stripe events.
- Users can never become entitled via Stripe (subscription gating cannot be correct).
- Any future webhook idempotency logic cannot run.
- SLICE-1 paywall cannot be completed or tested (integration/E2E).

## Repro

1. Start the app.
2. Call `POST /api/stripe/webhook` with any payload/signature.
3. Observe a 404 (route handler missing).

## Expected Behavior (per SSOT)

`POST /api/stripe/webhook`:
- Runs in **Node.js** runtime (not Edge)
- Reads raw request body and verifies signature with `stripe.webhooks.constructEvent`
- Records idempotency in `stripe_events`
- Applies subscription/customer updates idempotently
- Returns `{ received: true }` on success
- Returns `400` on signature verification failure

## Fix (Required)

Implement `app/api/stripe/webhook/route.ts` per `docs/specs/master_spec.md` §4.4.2 and `docs/specs/spec-011-paywall.md`.

Important: SSOT requires robust idempotency + concurrency control; current `StripeEventRepository` port likely needs extension to support “claim + lock” semantics (track separately in DEBT-019).

## Regression Tests (Required)

- Integration: `tests/integration/stripe-webhook.integration.test.ts`
  - `400` for invalid signature
  - idempotency: duplicate deliveries do not double-process
  - `stripe_events` marked processed/failed correctly

## Acceptance Criteria

- `app/api/stripe/webhook/route.ts` exists and is Node runtime
- Signature verification is mandatory (`constructEvent`)
- `stripe_events` idempotency is enforced (including concurrency safety)
- Subscription state is persisted to `stripe_subscriptions`
- Route returns `200` with `{ received: true }` on success and `400` on invalid signature

