# DEBT-305: Checkout Session Reuse/Expire Flow — Treat Already-Terminal Sessions Idempotently and Revalidate Reuse

**Priority:** P2
**Created:** 2026-03-11
**Status:** Open
**Related:** BUG-101 (Stripe-side duplicate-subscription guard)

---

## Context

Tracer-bullet verification of Stripe mutation call sites found another production read-then-act race in `createStripeCheckoutSession()`.

That flow:

1. Lists open checkout sessions for the customer
2. Retrieves the first candidate session to inspect its line items
3. Reuses the session if the requested plan matches
4. Otherwise expires the session and creates a replacement

Stripe state can change between the list, retrieve, reuse, and expire steps. For example:

- the user completes checkout in another tab
- the session expires naturally
- dashboard or support tooling changes the session state

---

## Current Behavior

Two gaps are currently visible:

1. **Same-price reuse path:** when `existingPriceId === priceId`, the code returns `existingUrl` immediately. It does not verify that the retrieved session is still active before handing the URL back to the user.
2. **Mismatched-price expire path:** if the session becomes completed or expired after retrieval but before `checkout.sessions.expire`, Stripe will return a semantic `4xx`. `callStripeWithRetry()` treats that as non-transient, and the flow throws `ApplicationError('STRIPE_ERROR', 'Failed to expire existing checkout session')` instead of continuing with new checkout creation.

The codebase already has tests for:

- generic expire failure
- inspection failure fallback
- successful expire-then-create

but it does not yet cover the already-terminal race cases above.

## Expected Behavior

The flow should be idempotent with respect to already-terminal checkout sessions:

1. If the retrieved session is already inactive, do not return its URL as reusable
2. If a mismatched session is already terminal by the time expire is attempted, treat that as success and continue to create a fresh session
3. Only unexpected Stripe expire failures should surface as `STRIPE_ERROR`

## Recommended Fix

Keep this logic inside the Stripe checkout adapter:

- Revalidate retrieved sessions with the existing `isSessionInactive(...)` helper before reusing `existingUrl`
- Add a Stripe semantic-error helper for the expire path so "already complete / already expired / no longer expireable" responses are treated as idempotent success conditions
- Continue to new session creation once that helper matches

This is adjacent to, but distinct from, the broader `subscriptions.list`-before-create window used as a duplicate-subscription guard. This debt is specifically about the checkout-session reuse / expire sub-flow.

## Test Plan

1. Add a test: retrieved same-price session is already inactive → do not return the old URL; create a fresh session instead
2. Add a test: `checkout.sessions.expire` returns an already-terminal Stripe `4xx` → new session is still created successfully
3. Keep the current behavior for unexpected expire failures: they should still throw `STRIPE_ERROR`
4. Keep the current inspection-failure fallback behavior unchanged

## Risk

P2 because:

- The failure is user-facing in the primary checkout funnel
- It can return a stale checkout URL or fail checkout creation even when the old session is already unusable
- The issue is operational rather than data-corrupting, but it directly impacts conversion and retry friction

## Source

Tracer-bullet verification on 2026-03-11 during the DEBT-303 related-pattern sweep.
