# BUG-008: Stripe Webhook Endpoint Missing (`/api/stripe/webhook`)

**Status:** Resolved
**Priority:** P0
**Date:** 2026-02-01
**Resolved:** 2026-02-01

## Summary

SSOT (master spec + SPEC-011 Paywall) requires a Stripe webhook route handler at `app/api/stripe/webhook/route.ts` to sync Stripe subscription state into Postgres (via `stripe_events`, `stripe_customers`, `stripe_subscriptions`). The route handler was missing, so Stripe could not deliver subscription events and the system could not become “subscription-aware”.

This is a hard blocker for SLICE-1 paywall acceptance criteria (subscribe → checkout success/webhook → DB subscription active → entitlement gate).

## Evidence / Current State

- **Implemented:** `app/api/stripe/webhook/route.ts` (Node runtime)
- **Middleware expects it:** `proxy.ts` treats `/api/stripe/webhook(.*)` as a public route (signature-protected)
- **End-to-end wiring exists:** route → controller → gateway + repositories (transactional)

## Impact

Before this fix:

- Stripe subscription state could not be persisted/updated from Stripe events.
- Users could not become entitled via Stripe (subscription gating could not be correct).
- Webhook idempotency logic could not run.
- SLICE-1 paywall could not be completed or tested (integration/E2E).

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

Resolved via:

- Implemented webhook route handler: `app/api/stripe/webhook/route.ts`
- Implemented controller orchestration: `src/adapters/controllers/stripe-webhook-controller.ts`
- Implemented SSOT idempotency primitives in `StripeEventRepository` and Drizzle adapter (see DEBT-019)

## Regression Tests (Required)

- Unit: `app/api/stripe/webhook/route.test.ts`
- Unit: `src/adapters/controllers/stripe-webhook-controller.test.ts`
- Integration (repositories): `tests/integration/repositories.integration.test.ts` (Stripe events coverage)

## Acceptance Criteria

- `app/api/stripe/webhook/route.ts` exists and is Node runtime
- Signature verification is mandatory (`constructEvent`)
- `stripe_events` idempotency is enforced (including concurrency safety)
- Subscription state is persisted to `stripe_subscriptions`
- Route returns `200` with `{ received: true }` on success and `400` on invalid signature
