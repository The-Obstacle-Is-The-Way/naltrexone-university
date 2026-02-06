# DEBT-125: Billing System Audit — Webhook Ordering, Race Conditions, and Edge Cases

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

---

## Description

A comprehensive audit of the entire billing/subscription flow uncovered multiple P2/P3 issues beyond the P1 bugs filed separately (BUG-075, BUG-076, BUG-077). These are edge cases, race conditions, and architectural gaps that are unlikely to hit most users today but will cause problems at scale or with certain payment methods.

## Overall Assessment

The billing system has strong fundamentals:
- Webhook idempotency via `stripe_events` table with `SELECT ... FOR UPDATE`
- Eager sync on checkout success to avoid race conditions
- Stripe signature verification on all webhooks
- Rate limiting on both webhooks and checkout actions
- Idempotency keys for Stripe API calls
- Clean Architecture separation across layers

The issues below are "second-order" problems — the kind that bite you 6 months in.

---

## Finding 1: Subscription Upsert Vulnerable to Out-of-Order Webhooks (P2)

**Files:**
- `src/adapters/repositories/drizzle-subscription-repository.ts:70-112`
- `src/adapters/controllers/stripe-webhook-controller.ts:80-89`

**Problem:**
Stripe does not guarantee webhook delivery order. The subscription upsert is "last write wins" — it blindly overwrites the existing row. If a stale `customer.subscription.updated` event (status: `active`) arrives after a newer `customer.subscription.deleted` event (status: `canceled`), the system would incorrectly show the user as active.

For "subscription ref" events (`checkout.session.completed`, `invoice.payment_*`), the code mitigates this by calling `stripe.subscriptions.retrieve()` to get the current state. But for direct subscription events (`customer.subscription.created/updated/deleted`), the code uses the event payload directly.

**Impact:** In rare timing scenarios, a canceled subscription could reappear as active, or vice versa.

**Fix:** For direct subscription events, also call `stripe.subscriptions.retrieve()` to get the latest state rather than trusting the event payload. Alternatively, compare Stripe's `event.created` timestamp and skip updates from older events.

---

## Finding 2: Webhook `FOR UPDATE` Lock Can Cause Stripe Timeout Under Contention (P2)

**Files:**
- `src/adapters/controllers/stripe-webhook-controller.ts:56-98`
- `src/adapters/repositories/drizzle-stripe-event-repository.ts`

**Problem:**
When a duplicate webhook arrives while the original is still processing, the `SELECT ... FOR UPDATE` lock causes the duplicate to block until the first transaction completes. Stripe has a 20-second timeout for webhook responses. If processing takes >20s (or if multiple duplicates queue up), Stripe will time out, mark the delivery as failed, and retry — creating more contention.

**Impact:** Under burst conditions (Stripe retries rapidly after a brief outage), webhook processing could enter a feedback loop of timeouts and retries.

**Fix:** After `claim()` returns false (row already exists), return `200 OK` immediately instead of waiting for the lock. If the first handler fails, the event remains unprocessed, and Stripe will retry. Alternatively, add a short timeout on the `FOR UPDATE` lock attempt (e.g., `NOWAIT` or a 5-second timeout).

---

## Finding 3: `stripeCustomers.insert` CONFLICT in Webhook Aborts Entire Event (P2)

**Files:**
- `src/adapters/controllers/stripe-webhook-controller.ts:75-78`
- `src/adapters/repositories/drizzle-stripe-customer-repository.ts:24-69`

**Problem:**
The webhook controller calls `stripeCustomers.insert(userId, externalCustomerId)` before upserting the subscription. If the user already has a different `stripeCustomerId` stored, the repository throws `ApplicationError('CONFLICT', ...)`. This aborts the entire webhook transaction and marks the event as errored.

This could happen if: a user's Stripe customer is recreated (admin action, data migration), or if the Stripe search API returned a stale result during customer creation. Once this happens, **every subsequent webhook for this user fails permanently** — Stripe retries, hits the same CONFLICT, and the subscription state never updates.

**Impact:** A user whose Stripe customer ID changes has their subscription frozen in whatever state it was in before the conflict. They could lose access permanently until manual DB intervention.

**Fix:** In the webhook context, the incoming `stripeCustomerId` is authoritative (it came from Stripe). Update the stored mapping instead of throwing CONFLICT. Alternatively, allow the subscription upsert to proceed even if the customer mapping fails (the subscription is the more important record).

---

## Finding 4: Canceled User Can't Re-subscribe Until Period Ends (P2)

**Files:**
- `src/application/use-cases/create-checkout-session.ts:56-62`

**Problem:**
This is a UX subset of BUG-075. When a user cancels their subscription with `cancelAtPeriodEnd: true`, their status remains `active` until the period ends (so they retain access — correct). But if they change their mind and want to switch from monthly to annual (or vice versa), they can't create a new checkout because the guard sees an active subscription.

The correct action for this user is to reactivate via the billing portal, not create a new checkout. But the error message says "Already subscribed" with no guidance.

**Impact:** Users who cancel and want to re-subscribe or change plans are confused by the error.

**Fix:** When throwing `ALREADY_SUBSCRIBED`, check if the subscription has `cancelAtPeriodEnd: true`. If so, redirect to the billing portal with a message like "Your subscription is still active until [date]. Manage it here." In `subscribe-action.ts`, add a specific handler for this case alongside the existing `ALREADY_SUBSCRIBED` redirect.

---

## Finding 5: Checkout Session Reuse Swallows Errors (P2)

**File:**
- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:31-89`

**Problem:**
The function checks for existing open checkout sessions before creating a new one. If an existing session is found with a different price, it tries to expire the old session. If the `expire()` call fails, the error is logged as a warning and execution falls through to creating a new session.

This means the old session remains open. If the user completes the old session (via browser history or a stale tab), they could end up on the wrong plan.

**Impact:** A user who clicked "Monthly," then went back and clicked "Annual" could have both sessions open. Completing the stale Monthly session would create the wrong subscription.

**Fix:** If `expire()` fails, log at error level (not warn) and consider whether to proceed or fail. At minimum, add monitoring/alerting for this condition. The idempotency of the subscription upsert would eventually correct the plan on the next webhook, but there's a window of wrong state.

---

## Finding 6: Missing `invoice.payment_action_required` Webhook Event (P2)

**File:**
- `src/adapters/gateways/stripe/stripe-webhook-processor.ts`

**Problem:**
The webhook processor does not handle `invoice.payment_action_required`. This event fires when a subscription renewal payment requires additional customer action (e.g., 3D Secure / SCA authentication). Without handling this, the app has no way to notify the user that their renewal is stuck.

In the EU and UK, Strong Customer Authentication (SCA) regulations mean this event fires frequently for subscription renewals.

**Impact:** EU/UK subscribers may have renewals silently fail because they didn't complete 3D Secure. Their subscription transitions to `past_due` → `canceled` without any in-app notification.

**Fix:** Add `invoice.payment_action_required` to the handled event types. When received, update subscription metadata or trigger a notification mechanism. At minimum, the subscription status will eventually update via `customer.subscription.updated`, but proactive notification improves retention.

---

## Finding 7: Rate-Limited Users See Generic Error (P3)

**File:**
- `src/adapters/controllers/billing-controller.ts:88-137`
- `app/pricing/subscribe-action.ts`

**Problem:**
When a user hits the checkout rate limit, the controller throws `ApplicationError('RATE_LIMITED', ...)`. The subscribe action only handles `UNAUTHENTICATED` and `ALREADY_SUBSCRIBED` specifically — all other errors go to the generic `?checkout=error` redirect.

**Impact:** Rate-limited users see "Checkout failed. Please try again." instead of "Too many attempts. Please wait and try again."

**Fix:** Add a `RATE_LIMITED` case in `subscribe-action.ts` that redirects with a specific message.

---

## Finding 8: No `createdAt` on `stripe_events` Table (P3)

**File:**
- `db/schema.ts:168-180`

**Problem:**
The `stripe_events` table tracks `processedAt` but has no `createdAt` timestamp. This means:
- Cannot determine when a webhook was first received vs. when it was processed
- Cannot measure webhook processing latency
- Cannot detect events that are stuck (claimed but not processed)

**Impact:** No direct user impact. This is an observability gap that makes debugging webhook issues harder.

**Fix:** Add `createdAt` column with `defaultNow()`.

---

## Finding 9: Retry Logic Doesn't Handle Stripe 429 (Rate Limit) (P3)

**File:**
- `src/adapters/shared/retry.ts:34-55`

**Problem:**
`isTransientExternalError` checks for network errors and 5xx status codes but not HTTP 429 (Too Many Requests). The Stripe SDK has its own built-in retry logic that handles 429s, but the app-level `callStripeWithRetry` wrapper ignores them.

**Impact:** If the app-level retry is the primary retry mechanism (and Stripe SDK retry is disabled or insufficient), rate-limited Stripe API calls would fail immediately instead of retrying.

**Fix:** Add 429 to retryable status codes in `isTransientExternalError`, respecting the `Retry-After` header.

---

## Finding 10: Single Subscription Per User — No History (P3)

**File:**
- `db/schema.ts:132-165`

**Problem:**
The `stripe_subscriptions` table has a UNIQUE constraint on `userId`. When a user's subscription changes (cancel + re-subscribe), the old subscription data is overwritten. There's no audit trail.

**Impact:** Cannot build subscription history, churn analytics, or revenue reporting from the local database. All historical data must come from Stripe's API.

**Fix:** This is a deliberate design decision for MVP simplicity. When analytics become important, either:
- Add a `subscription_history` table that logs changes
- Or query Stripe's API for historical data

---

## Verification

- [ ] Each finding assessed for whether it needs immediate fix vs. tracked as debt
- [ ] P1 bugs (BUG-075, BUG-076, BUG-077) fixed first
- [ ] P2 findings addressed before production launch with real payments
- [ ] P3 findings tracked for post-launch

---

## Related

- BUG-075: Checkout guard / entitlement mismatch (P1)
- BUG-076: pastDue immediate lockout (P1)
- BUG-077: paymentProcessing confusing redirect (P1)
- `src/adapters/gateways/stripe/` (all Stripe gateway code)
- `src/adapters/controllers/stripe-webhook-controller.ts`
- `src/application/use-cases/create-checkout-session.ts`
- `src/domain/services/entitlement.ts`
- `app/api/stripe/webhook/handler.ts`
- BUG-052 (archived — earlier checkout guard fix)
- BUG-024 (archived — earlier entitlement race condition fix)
- DEBT-069 (archived — document eager sync pattern)
