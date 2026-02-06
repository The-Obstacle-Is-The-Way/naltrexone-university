# DEBT-125: Billing System Audit — Webhook Ordering, Race Conditions, and Edge Cases

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-06
**Resolved:** 2026-02-06

---

## Description

A comprehensive audit of the billing/subscription flow uncovered P2/P3 issues that are mostly edge-case correctness, recoverability, and observability gaps. These issues are unlikely to affect most users immediately, but they can cause incidents at scale or with specific payment-method/regional paths.

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

## Finding 2: Duplicate Webhook Lock Contention Can Inflate Latency (P2)

**Files:**
- `src/adapters/controllers/stripe-webhook-controller.ts:56-98`
- `src/adapters/repositories/drizzle-stripe-event-repository.ts`

**Problem:**
`processStripeWebhook` always calls `lock(eventId)` after `claim()`. For duplicate deliveries, that means an extra transaction can block on the same row lock while the first handler is still processing.

This is correct for safety, but under high duplicate traffic it can increase response time and retry pressure.

**Impact:** Under burst conditions, webhook response latency can spike and increase Stripe retries, amplifying database contention.

**Fix:** Keep idempotency semantics, but add a non-blocking fast path:
- read current event state before lock; if already processed successfully, return early
- for unprocessed duplicates, use short lock timeout / `NOWAIT` + retry strategy instead of unbounded blocking
- do **not** simply skip when `claim()` is false, because failed rows must still be reprocessed

---

## Finding 3: `stripeCustomers.insert` CONFLICT in Webhook Aborts Entire Event (P2)

**Files:**
- `src/adapters/controllers/stripe-webhook-controller.ts:75-78`
- `src/adapters/repositories/drizzle-stripe-customer-repository.ts:24-69`

**Problem:**
The webhook controller calls `stripeCustomers.insert(userId, externalCustomerId)` before upserting the subscription. If the user already has a different `stripeCustomerId` stored, the repository throws `ApplicationError('CONFLICT', ...)`. This aborts the entire webhook transaction and marks the event as errored.

This could happen if a user's Stripe customer is recreated (admin action/migration) or metadata mappings drift. Once this happens, subsequent webhook updates for that user can continue failing until the mapping is repaired.

**Impact:** A user whose Stripe customer ID mapping drifts can have subscription state stuck until manual intervention.

**Fix:** In the webhook context, the incoming `stripeCustomerId` is authoritative (it came from Stripe). Update the stored mapping instead of throwing CONFLICT. Alternatively, allow the subscription upsert to proceed even if the customer mapping fails (the subscription is the more important record).

---

## Finding 4: Pricing Lacks Context for Current Non-Entitled Subscriptions (P2)

**Files:**
- `src/application/use-cases/create-checkout-session.ts:56-62`
- `src/application/use-cases/check-entitlement.ts`
- `app/pricing/page.tsx`
- `app/pricing/subscribe-action.ts`

**Problem:**
Pricing loads only `{ isEntitled }`, not subscription status/context. Users in recoverable non-entitled states (for example `pastDue` or `paymentProcessing` with `currentPeriodEnd > now`) initially see subscribe CTAs. Submitting subscribe then redirects to `manage_billing` via `ALREADY_SUBSCRIBED`.

This is not a checkout-guard correctness bug (the strict guard is intentional from BUG-052), but it is a UX/context gap.

**Impact:** Confusing subscribe-then-redirect loop and avoidable failed checkout attempts.

**Fix:** Return status/reason context from entitlement checks and render manage-billing guidance on initial pricing load for recoverable non-entitled states.

---

## Finding 5: Checkout Session Reuse Swallows Errors (P2)

**File:**
- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:31-89`

**Problem:**
The function checks for existing open checkout sessions before creating a new one. If an existing session is found with a different price, it tries to expire the old session. If the `expire()` call fails, the error is logged as a warning and execution falls through to creating a new session.

This means the old session remains open. If the user completes the old session (via browser history or a stale tab), they could end up on the wrong plan.

**Impact:** A user who clicked "Monthly," then went back and clicked "Annual" could have both sessions open. Completing the stale Monthly session would create the wrong subscription.

**Fix:** If `expire()` fails, avoid silently falling through. Either:
- fail fast and show a recoverable error, or
- continue only with explicit error telemetry and alerting

The current warning-only behavior makes wrong-plan completions harder to detect.

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

## Resolution (2026-02-06)

Implemented all actionable findings in this audit:

- Finding 1: Direct subscription webhooks now retrieve canonical subscription state via `stripe.subscriptions.retrieve()` before normalization.
- Finding 2: Added idempotency fast path (`claim` + `peek`) to skip lock acquisition for already-processed duplicates.
- Finding 3: Added webhook-authoritative Stripe customer mapping updates (`conflictStrategy: 'authoritative'`) to avoid conflict aborts when customer ID drifts for the same user.
- Finding 4: Resolved through BUG-075/BUG-077 entitlement-context changes.
- Finding 5: Checkout session expiration failure now fails fast with `STRIPE_ERROR` instead of silently falling through.
- Finding 6: Added `invoice.payment_action_required` handling in webhook normalization flow.
- Finding 7: Subscribe action now handles `RATE_LIMITED` with a dedicated redirect/banner.
- Finding 8: Added `stripe_events.created_at` with migration `db/migrations/0006_mushy_ghost_rider.sql`.
- Finding 9: Retry classifier now treats HTTP 429 as transient.

Deliberately unchanged:

- Finding 10 remains an accepted MVP tradeoff (single current subscription row, no local history table).

---

## Verification

- [x] Each finding assessed for whether it needs immediate fix vs. tracked as debt
- [x] P2 findings addressed
- [x] P3 findings either addressed or explicitly accepted with rationale

---

## Related

- BUG-075: pricing CTA mismatch for recoverable subscription states
- BUG-077: payment-processing users see generic subscription-required redirect
- `src/adapters/gateways/stripe/` (all Stripe gateway code)
- `src/adapters/controllers/stripe-webhook-controller.ts`
- `src/application/use-cases/create-checkout-session.ts`
- `src/domain/services/entitlement.ts`
- `app/api/stripe/webhook/handler.ts`
- BUG-052 (archived — earlier checkout guard fix)
- DEBT-069 (archived — document eager sync pattern)
