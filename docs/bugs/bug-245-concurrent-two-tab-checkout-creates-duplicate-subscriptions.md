# BUG-245: Concurrent Two-Tab Checkout Defeats Every Duplicate-Subscription Guard — Two Live Subscriptions, One Customer

**Status:** Open
**Priority:** P2 (double billing on a concurrent window; masked in-app because the local row shows only one subscription)
**Date:** 2026-06-11
**Family:** Billing / checkout creation race / idempotency
**Related:** [BUG-244](../_archive/bugs/bug-244-reconciliation-cron-never-scheduled.md) (the heal that would cancel the duplicates never runs), [BUG-026](../_archive/bugs/bug-026-concurrent-checkout-sessions.md) (scoped its fix to "normal multi-tab flows"), [BUG-047](../_archive/bugs/bug-047-multiple-subscriptions-per-user.md) (Related note: the concurrent gap "wasn't fully addressed"), [BUG-101](../_archive/bugs/bug-101-stripe-checkout-allows-duplicate-subscriptions-when-db-stale.md) (guards creation-time against *existing* subs only), [BUG-148](../_archive/bugs/bug-148-stripe-checkout-idempotency-key-fallback-random.md) (hardened only the *fallback* key; the normal UI path still sends per-tab random keys)

---

## Description

Every duplicate-subscription guard in the system keys on a subscription that **does not yet exist** during a fresh first-timer/churned checkout, so two checkout creations launched within the same ~0.3–1.5 s window both pass every guard and both produce a completable Stripe Checkout Session. Completing both yields **two live subscriptions on one customer** — two simultaneous charges (monthly + annual, or two same-plan, or two free trials). The local `stripe_subscriptions` row holds only one record (userId-keyed upsert, last webhook wins), so the app UI shows a single subscription while Stripe bills two; the user only sees the duplicate in the Stripe portal / on their card statement.

The normal UI path also actively bypasses the BUG-148 deterministic-key collapse: `IdempotencyKeyField` mints a fresh `crypto.randomUUID()` per tab render, and that client UUID is forwarded as the **Stripe** idempotency key, so even two *same-plan* concurrent creates get distinct keys and Stripe does not collapse them.

## Steps to Reproduce

1. As a user with no blocking subscription (first-timer or churned resubscriber), open `/pricing` in two tabs.
2. Click **Subscribe Monthly** in tab 1 and **Subscribe Annual** in tab 2 within ~1 s.
3. Complete both Stripe Checkout pages. For trial-eligible users both are no-card `trial:7` sessions (free, two click-throughs); for churned paid users both are real payments.
4. Observe two active/trialing subscriptions on the one Stripe customer; `/app/billing` shows only the one that won the last webhook upsert.

## Root Cause

Tracer bullet:

1. `app/pricing/pricing-view.tsx:144-159, 179-194` render each plan form with `<IdempotencyKeyField />`; `components/idempotency-key-field.tsx:5-8` returns `useState(() => crypto.randomUUID())` — a **distinct key per tab/render**.
2. `app/pricing/subscribe-actions.ts:41-75` forward each form's key into `runSubscribeAction`.
3. `src/adapters/controllers/billing-controller.ts:111-120` — `CHECKOUT_SESSION_RATE_LIMIT` is 10/min (`src/adapters/shared/rate-limits.ts:21-24`); both requests pass.
4. `billing-controller.ts:139-146` — `executeIdempotent` is keyed `(userId, 'billing:createCheckoutSession', idempotencyKey)`; **distinct per-tab keys ⇒ no cross-tab DB dedup**, both execute.
5. `src/application/use-cases/create-checkout-session.ts:112-122` — with no subscription row (or a canceled one) both pass the local `ALREADY_SUBSCRIBED` guard; `:144-148` forwards the client UUID as the gateway idempotency option.
6. `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:151-191` — both run `subscriptions.list` **before either subscription exists** → neither sees a blocking sub (the TOCTOU window is the full list+list+create latency).
7. `stripe-checkout-sessions.ts:193-204` — both run `checkout.sessions.list({ status: 'open' })` before either create lands → both see none, so the BUG-026 open-session reuse/expire logic never engages.
8. `stripe-checkout-sessions.ts:439-443` — `primaryIdempotencyKey = options?.idempotencyKey` (two different UUIDs) → Stripe creates **two distinct open sessions even for the same plan**; the deterministic fallback `checkout_session:${userId}:${plan}` (BUG-148) that *would* collapse same-plan concurrent creates is bypassed whenever a client key is present, i.e. on the normal UI path.
9. No completion-time constraint exists: Stripe subscription-mode checkout does not, by default, block a second subscription per customer, and no code sets one. Completing both sessions creates two live subscriptions.
10. `src/adapters/controllers/stripe-webhook-controller.ts:132-140` + `drizzle-subscription-repository.ts:89-99` — both subscriptions' webhooks upsert the **same** userId row; the DB silently shows one. The designed healer (`reconcile-stripe-subscriptions.ts:237-262`) cancels duplicates only with `dryRun=false`, and per [BUG-244](../_archive/bugs/bug-244-reconciliation-cron-never-scheduled.md) nothing invokes it.

## Impact

- **Double billing** for the concurrent window: monthly + annual, two same-plan subscriptions, or (for trial-eligible users) two simultaneous trials that both convert to charges after 7 days.
- The duplicate is **invisible in-app** (single local row), so neither the user nor the owner sees it through the product UI — only Stripe billing / the customer's statement reveals it. With reconciliation unscheduled (BUG-244), nothing auto-corrects it.
- Likelihood is modest (requires near-simultaneous double submit) but non-adversarial: two tabs / a double-click across tabs / an impatient retry all reach it, and the trial path makes "complete both" frictionless.

## Expected Fix (options)

1. **Deterministic Stripe key for same-plan collapse.** Keep the client UUID for DB-level `executeIdempotent`, but send a **deterministic per-user Stripe key** (`checkout_session:${userId}:${plan}[:${variant}]`, reusing the BUG-148 recovery-key machinery) as the gateway idempotency key so concurrent same-plan creates collapse to one session at Stripe.
2. **Serialize checkout creation per user (closes the cross-plan race).** Claim a user-scoped action lock before the gateway call (or re-list open sessions immediately after create and expire all but the newest), so monthly-tab + annual-tab cannot both end with a live session.
3. **Defense-in-depth at Stripe.** Enable Stripe Checkout's "limit customers to one subscription" Dashboard setting so completion of the second session is rejected even if a second session is created.
4. **Heal path.** Wire and un-dry-run the reconciler (BUG-244 remediation) as the backstop for any duplicate that still slips through.

Options 1+2 are the code fix; 3+4 are durable backstops. A unit/integration test exercising two concurrent `createCheckoutSession` calls (currently absent — zero concurrent-create tests in `stripe-payment-gateway.test.ts` / `billing-controller.test.ts`) should accompany the fix.

## Implemented Decision

This PR implements options 1+2 in the checkout creation path only:

1. **Same-plan collapse:** the client UUID remains load-bearing for controller-level DB idempotency (`executeIdempotent`), but the Stripe checkout-create idempotency key is now deterministic per user, plan, and checkout variant (`checkout_session:${userId}:${plan}[:${variant}]`). The existing replacement/recovery key (`checkout_session_recovery:...`) still takes precedence for the expire-and-replace path.
2. **Cross-plan race:** the Stripe gateway uses lock-free post-create reconciliation. After a successful primary or recovered checkout create, it re-lists open checkout sessions for the customer and expires every non-canonical open session, choosing the newest session by Stripe `created` timestamp. No DB transaction or advisory lock is held across Stripe I/O.
3. **Rejected alternatives:** forwarding the per-tab client UUID to Stripe was rejected because it bypasses deterministic collapse; a long DB/advisory lock around Stripe list/create/expire was rejected because it would hold application/database serialization across external network calls.

Backstops remain outside this PR:

- **OWNER action:** enable Stripe Checkout's Dashboard setting to limit customers to one subscription. This is the completion-time-proof guard if more than one checkout URL ever exists.
- **BUG-244:** scheduled reconciliation is responsible for periodic healing/canceling of duplicate Stripe subscriptions that already exist or slip through later. This PR closes the create-time window but does not replace the reconciler.

## Verification

- [x] Test: two concurrent same-plan `createCheckoutSession` calls with distinct client keys produce **one** Stripe session (deterministic gateway key collapses them).
- [x] Test: two concurrent different-plan calls end with at most one completable session (serialization / post-create expire).
- [ ] Manual: two-tab monthly+annual repro yields one live subscription after the fix.
- [x] Sequential multi-tab behavior (open-session reuse / mismatched-plan expire) is unchanged — existing tests stay green.
- [x] Regression: same-form double-submit with the same client key still dedups through controller-level `executeIdempotent`.
- [x] Regression: BUG-148 deterministic recovery / replacement idempotency path remains intact.

## Surfaces Confirmed

- **Sequential** multi-tab is genuinely handled: open-session reuse (`stripe-checkout-sessions.ts:244-252`) and expire-and-replace for mismatched plan/variant (`:289-336`). This bug is strictly the **concurrent** window before either session/subscription exists.
- Same-form double-click *is* deduped (one mounted UUID → DB `executeIdempotent` replays the first result); the gap is two **separate** form mounts (two tabs) with two UUIDs.
- Duplicate Stripe **customer** creation is contained (metadata search dedup + deterministic `create_stripe_customer:${userId}` key + DB CONFLICT re-read); only duplicate **subscriptions** are unguarded here.
- BUG-101 guards creation against an *existing* subscription (stale DB); it cannot help when neither subscription exists yet.
