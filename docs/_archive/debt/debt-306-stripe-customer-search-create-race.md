# DEBT-306: Stripe Customer Search/Create Race — Concurrent or Late-Visible Customers Can Violate the 1:1 Mapping

**Priority:** P2
**Created:** 2026-03-11
**Status:** Resolved
**Resolved:** 2026-03-11
**Related:** ADR-005 (Payment Boundary / 1:1 Stripe customer mapping), BUG-106, BUG-117
**Verification:** `pnpm typecheck`, `pnpm lint`, `pnpm test --run`, `pnpm test:browser`, `pnpm test:integration`, and `pnpm build` passed on 2026-03-11. `CreateCheckoutSessionUseCase` regression coverage now includes concurrent insert-conflict adoption, orphaned-customer warning logs, and non-`CONFLICT` insert error propagation.

---

## Resolution

The local `stripe_customers` table is now the coordination boundary for in-app Stripe customer creation.

`CreateCheckoutSessionUseCase.getOrCreateStripeCustomerId(...)` now does this:

1. Reuse the existing local mapping when `StripeCustomerRepository.findByUserId(...)` succeeds
2. Create the Stripe customer through `PaymentGateway.createCustomer(...)` when the local mapping is missing
3. Attempt a strict local insert of the new mapping
4. If the insert conflicts, re-read the canonical local mapping, return the winner, and log the orphaned Stripe customer id at warn level
5. Re-throw non-`CONFLICT` insert failures unchanged

The use case also now passes `create_stripe_customer:${userId}` so in-app customer creation uses the same deterministic idempotency-key namespace as the Stripe adapter fallback.

This resolves the application-layer race without changing the Stripe adapter, the repository port, or the Drizzle repository implementation.

## Context

`createStripeCustomer()` performs a Stripe-side search by `metadata.user_id` before creating a new customer. That search is still useful as a best-effort reuse mechanism, but it is not a reliable coordination boundary because:

- two in-app requests can both observe "no local mapping" before either insert commits
- Stripe Search is eventually consistent and can lag recent writes
- external actors can create Stripe customers out of band

The authoritative invariant from ADR-005 lives in the local `stripe_customers` mapping, not in Stripe Search results.

## Original Behavior

Before this fix, `CreateCheckoutSessionUseCase` did:

1. `stripeCustomers.findByUserId(userId)`
2. `payments.createCustomer(...)`
3. `stripeCustomers.insert(userId, stripeCustomerId)`

If step 3 threw `ApplicationError('CONFLICT', ...)`, the request failed even though another request had already established the canonical local mapping. That turned a recoverable race into an application error.

## Expected Behavior

The checkout-session use case should converge on the canonical local mapping:

1. Concurrent requests for the same user should return the locally persisted winner instead of failing on insert conflict
2. Only non-`CONFLICT` persistence failures should fail the request
3. Any losing Stripe customer created during the race should be treated as an orphaned external artifact and logged for possible cleanup

## Trade-Off

This fix intentionally accepts low-frequency orphaned Stripe customers as the cost of keeping coordination local and simple. Those orphaned customers do not become authoritative because only the locally persisted mapping is reused by future application flows.

## Source

Tracer-bullet verification on 2026-03-11 during the Stripe mutation call-site sweep.
