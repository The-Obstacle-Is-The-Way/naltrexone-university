# BUG-026: No Protection Against Concurrent Checkout Sessions

**Status:** Resolved
**Priority:** P2 - Medium
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

A user could initiate multiple Stripe Checkout Sessions in parallel (e.g. multiple tabs). If multiple sessions were completed, it could lead to double billing and ambiguous subscription state.

## Root Cause

The checkout creation path always created a new Checkout Session and did not attempt to reuse an already-open session for the same Stripe customer.

## Fix

Implemented session de-duplication in `StripePaymentGateway.createCheckoutSession()`:

1. List open Checkout Sessions for the Stripe customer (`status: 'open'`, `limit: 1`).
2. If an open session exists and has a URL, return that URL instead of creating a new session.
3. Otherwise create a new session as before.

This prevents accidentally creating multiple concurrently-open sessions for the same customer in normal multi-tab flows.

## Verification

- [x] Unit test added for open-session reuse (`src/adapters/gateways/stripe-payment-gateway.test.ts`)
- [x] `pnpm test --run`

## Related

- `src/adapters/gateways/stripe-payment-gateway.ts`
