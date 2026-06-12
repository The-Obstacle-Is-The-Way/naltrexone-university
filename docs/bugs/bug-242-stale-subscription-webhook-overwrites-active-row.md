# BUG-242: Late Webhook From a Superseded Subscription Overwrites the Active Subscription Row (userId-Keyed Last-Write-Wins Upsert Has No Identity/Recency Guard)

**Status:** Open
**Resolution State:** Fix implemented in `fix/bug-242-243-subscription-identity-recency-guard`; pending owner grade, merge verification, and archival.
**Priority:** P1 (paying user fully locked out of `/app/*` with no self-service recovery; can persist up to a full billing cycle)
**Date:** 2026-06-11
**Family:** Billing / Stripe webhook / subscription state machine
**Related:** [BUG-243](./bug-243-checkout-success-replay-overwrites-active-subscription.md) (same missing guard, user-triggerable entry point), [BUG-244](./bug-244-reconciliation-cron-never-scheduled.md) (the heal that would bound this never runs), [BUG-205](../_archive/bugs/bug-205-reconciliation-prefers-stale-local-subscription-over-canonical-stripe-state.md) (reconciliation winner selection — different layer), [BUG-183](../_archive/bugs/bug-183-stripe-webhook-failure-state-rolled-back.md) (webhook failure persistence — adjacent, fixed), [DEBT-383](../_archive/debt/debt-383-canceled-subscription-recovery-trap.md) (recovery-path UX for a *correctly* canceled row — here the row is *wrongly* canceled)

---

## Description

`stripe_subscriptions` holds exactly one row per user, and every webhook-driven write is a last-write-wins upsert keyed on `userId`. The write carries no check that the event's subscription is still the user's *current* subscription. When a user has ever had more than one Stripe subscription (the standard DEBT-410 lineage: no-card trial sub A auto-canceled at trial end, then paid sub B; or any cancel → resubscribe), a late-processed webhook that references the *old* subscription re-fetches its live state — genuinely `canceled` — and overwrites the row that was correctly pointing at the new active subscription.

The webhook pipeline's re-fetch-current-state design (`retrieveAndNormalizeStripeSubscription`) makes processing order-safe *within one subscription*, but it cannot protect across subscriptions: for a superseded subscription, the authoritative current state is exactly the stale state that does the damage.

Stripe does not guarantee delivery order and retries failed deliveries for up to ~3 days. Our own webhook endpoint manufactures the delay window: the rate limiter answers 429 before signature verification (`app/api/stripe/webhook/handler.ts:49-66`), and any transient 500 (`handler.ts:97-101`) also queues a retry. A retried `customer.subscription.deleted` (or any subscription-ref event) for old sub A that lands after sub B's `created`/`updated` events flips the row back to `canceled`.

## Steps to Reproduce

1. User subscribes (sub A), cancels; `customer.subscription.deleted` for A is delivered but the first attempt fails (429 from `webhook:stripe:<ip>` rate limit, deploy-window 500, or DB blip) → Stripe schedules a retry.
2. User resubscribes (sub B); `checkout.session.completed` / `customer.subscription.created` for B process normally → row = (B, `active`, future `currentPeriodEnd`).
3. Stripe's retry of A's `deleted` event arrives. Event-id dedup does not apply (different event id). The processor re-fetches sub A: status `canceled`.
4. The controller upserts (A, `canceled`, A's past period end) over the row → user is non-entitled everywhere.

## Root Cause

Tracer bullet from entry point to fault:

1. `POST /api/stripe/webhook` → `processStripeWebhook` — any event that yields a `subscriptionUpdate` unconditionally writes it: `src/adapters/controllers/stripe-webhook-controller.ts:125-141` (no comparison against the stored row's `stripeSubscriptionId`, no recency check).
2. The update is built by re-fetching the referenced subscription's *current* state: `src/adapters/gateways/stripe/stripe-webhook-processor.ts:114-146` → `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts:103-156`. For a superseded subscription this faithfully returns `canceled`.
3. The write is a blind last-write-wins upsert keyed on `userId`: `src/adapters/repositories/drizzle-subscription-repository.ts:70-115`, with `onConflictDoUpdate({ target: stripeSubscriptions.userId, set: { stripeSubscriptionId, status, priceId, currentPeriodEnd, cancelAtPeriodEnd, … } })` at `:89-99`. The repository even exposes `findByExternalSubscriptionId` (`:59-68`) — the data needed for an identity guard exists; no caller uses it.
4. Entitlement reads only this row: `src/domain/services/entitlement.ts:13-21` via `src/application/use-cases/check-entitlement.ts:31-63` — `canceled` (and/or past `currentPeriodEnd`) → not entitled. There is no live-Stripe fallback at any gate.
5. Every `/app/*` request bounces the paying user: `app/(app)/app/layout.tsx:33-52` redirects to `/pricing?reason=subscription_required` ("Your access ended — choose a plan to continue.", `app/pricing/page.tsx:103-119`).
6. Self-service recovery is impossible: Subscribe passes the local guard (`src/application/use-cases/create-checkout-session.ts:112-122` — canceled row, past period) but the gateway's live-Stripe pre-check finds ACTIVE sub B and throws `ALREADY_SUBSCRIBED` (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts:151-191`) → redirect to `/pricing?reason=manage_billing` (`app/pricing/subscribe-action.ts:35-37`) → "Subscription found. Manage billing…" → the portal shows a perfectly healthy active subscription. The user loops between "choose a plan" and "manage billing" while Stripe keeps billing sub B.

The corrupted row heals only when some sub-B webhook fires (next renewal invoice — up to ~30 days monthly, ~1 year annual — or a portal mutation that emits a subscription event), or a manual reconciliation run ([BUG-244](./bug-244-reconciliation-cron-never-scheduled.md): nothing scheduled invokes it).

## Impact

- A paying user is locked out of the entire app while being billed, with no path they can fix themselves; support burden lands on the owner.
- The trigger population is broad: *every* trial-converted user (DEBT-410 lineage) and every churn-and-return user has a superseded subscription whose late events can do this. The probability per event is low (requires a failed-then-retried delivery overlapping the resubscribe), but the webhook 429/500 paths make it real, and the blast radius per occurrence is a full lockout for up to a billing cycle.
- Scope note (not an extra trigger): the *cancel-at-period-end* path does **not** add an independent, retry-free vector. While sub A sits in that window it is still `active` — a blocking-checkout status (`src/domain/value-objects/subscription-status.ts:41`) — so the create-checkout guard (`src/application/use-cases/create-checkout-session.ts:113-122`) refuses sub B until A has actually flipped to `canceled`. By then A's `deleted` event has normally already been delivered, so re-clobbering still requires the failed-then-retried or out-of-order delivery of the primary scenario above.

## Implemented Fix

Chosen placement: a pure domain policy, `shouldPersistSubscriptionWrite`, owns the business rule (`src/domain/services/subscription-write-guard.ts:25-42`). The Drizzle adapter serializes writes per user with a transaction-scoped advisory lock, locks the current row, then calls that predicate before the upsert (`src/adapters/repositories/drizzle-subscription-repository.ts:82-135`). The fake repository accepts an injected clock and explicit external-subscription seed identity, then calls the same predicate (`src/application/test-helpers/fakes/fake-subscription-repository.ts:43-113`). Webhook, checkout-success, and reconciliation writers inherit identical semantics through `SubscriptionRepository.upsert`, which now reports whether the write persisted or was skipped (`src/application/ports/subscription-repository.ts:16-27`).

Rule: reject only a different-subscription write when the stored row is still entitled (`active`, `inTrial`, or `pastDue` with future `currentPeriodEnd`) and the incoming write is terminal (`canceled` or `paymentFailed` / Stripe `incomplete_expired`). Allow same-subscription lifecycle changes, fresh first-checkout writes, churned resubscribe over a terminal row, and reconciliation's different blocking canonical winner.

Rejected alternatives:
- Drizzle-only guard: rejected because it would put current-subscription policy in infrastructure and make `FakeSubscriptionRepository` diverge from production.
- Stripe `created` timestamp threading: rejected for this fix because the confirmed BUG-242/243 regression is terminal superseded-state overwrite, and the existing identity + status + current-period data is sufficient to block that path without widening Stripe DTOs.
- Point-of-pain re-sync on `ALREADY_SUBSCRIBED`: rejected as a recovery complement, not a durable prevention layer.

## Verification

- [x] Domain truth table covers first row, same-subscription terminal transition, active/inTrial/pastDue protection, expired/current terminal cases, churned resubscribe, unpaid/paused recoverable states, and reconciliation's different canonical winner (`src/domain/services/subscription-write-guard.test.ts:23-148`).
- [x] Unit test: webhook event for superseded canceled sub A does not downgrade an active sub-B row (`src/adapters/controllers/stripe-webhook-controller.test.ts:261-316`).
- [x] Unit test: legitimate same-subscription terminal transitions still persist in the fake, and constructor-seeded fake rows can carry external subscription identity for guard parity (`src/application/test-helpers/fakes/fake-subscription-repository.test.ts:98-187`).
- [x] Unit test: Drizzle upsert serializes per user before reading the current row (`src/adapters/repositories/drizzle-subscription-repository.test.ts:180-226`).
- [x] Reconcile regression test: a different canonical blocking winner still persists over a current entitled row (`src/adapters/jobs/reconcile-stripe-subscriptions.test.ts:1079-1126`).
- [x] Real Drizzle integration test: seed (B, `active`, future period), upsert superseded terminal A, row stays B; same-id active→canceled still persists (`tests/integration/stripe-repositories.integration.test.ts:189-272`).
- [x] Focused verification green: `pnpm test --run src/domain/services/subscription-write-guard.test.ts src/application/test-helpers/fakes/fake-subscription-repository.test.ts src/adapters/controllers/stripe-webhook-controller.test.ts app/(marketing)/checkout/success/page.test.ts src/adapters/jobs/reconcile-stripe-subscriptions.test.ts src/adapters/repositories/drizzle-subscription-repository.test.ts` and `pnpm test:integration --run tests/integration/stripe-repositories.integration.test.ts`.

## Surfaces Confirmed

- Event-id dedup (`claim`/`peek`/`lock` in `drizzle-stripe-event-repository.ts`) is airtight for *replays of the same event* — it cannot help here because each delivery is a distinct event id.
- The re-fetch design correctly handles all single-subscription out-of-order arrivals; this bug is strictly the cross-subscription identity gap.
- `checkout-success` eager sync shares the same missing guard with a user-triggerable entry point — filed separately as [BUG-243](./bug-243-checkout-success-replay-overwrites-active-subscription.md).
