# DEBT-383: Canceled Subscription Recovery Trap

**Priority:** P1 (authenticated canceled subscribers can be trapped away from both `/app/*` and normal re-subscribe plans)
**Created:** 2026-05-13
**Status:** Open — root cause confirmed from Stripe retention policy + runtime diagnostics; no production code change yet
**Owner:** Billing / entitlement
**Related:** [DEBT-310 (archived)](../_archive/debt/debt-310-stripe-stale-price-id-in-production-db.md), [DEBT-155 (archived)](../_archive/debt/debt-155-stripe-legacy-duplicate-subscriptions-reconciliation.md), [DEBT-332](./debt-332-security-posture-audit.md)

---

## TL;DR

The original DEBT-383 draft claimed this was Stripe/webhook state drift. That was wrong.

Live read-only diagnostics on 2026-05-13 show the affected test-mode account is blocked because the Stripe subscription is actually canceled:

- DB row for `jj@novamindnyc.com`: `stripe_subscriptions.status = 'canceled'`, `cancel_at_period_end = false`, `current_period_end = 2026-06-06T21:22:44Z`, `updated_at = 2026-05-07T21:51:04Z`.
- Stripe subscription `sub_1SxwUEKItmaHAwgUESbx3reB`: `status = 'canceled'`, `canceled_at = 2026-05-07T21:50:59Z`, `ended_at = 2026-05-07T21:50:59Z`, `cancellation_details.reason = 'cancellation_requested'`.
- Stripe metadata and price mapping are correct: `metadata.user_id` matches the local user UUID and the price matches `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`.
- The local `customer.subscription.deleted` webhook event processed successfully at `2026-05-07T21:51:04Z`; there is no failed Stripe event evidence for this user.
- Stripe Dashboard reports the event **Source = Automatic**. The subscription was created `2026-02-06T21:22:44Z` and canceled `2026-05-07T21:50:59Z` — 90.02 days later.

The Stripe portal screenshot showing March/April/May paid invoices proves invoice history, not an active subscription. The portal also does not show an active subscription management section in the screenshot, which is consistent with the API result.

Clearing the browser will not fix this. The app is making a server-side entitlement decision from Stripe-backed database state. The immediate unblock is to create a new active subscription or otherwise deliberately re-provision the dogfood account; do not hand-edit the DB to `active` while Stripe says `canceled`.

**Source of truth:** Stripe is the canonical source for billing state; `stripe_subscriptions` is the app's read model populated by webhooks. Stripe's support doc ["Data retention policy for test subscriptions"](https://support.stripe.com/questions/data-retention-policy-for-test-subscriptions) says test/sandbox subscriptions are automatically canceled 90 days after creation unless excluded from auto-cancellation; the subscription moves to `status: canceled` and Stripe emits `customer.subscription.deleted`. Live-mode subscriptions are not subject to this test-retention behavior.

---

## Corrected Verdict

This is **not** a webhook-secret rotation incident, not Vercel secret drift, not missing `metadata.user_id`, not a stale local row, and not evidence of leaked Stripe credentials.

It is a product recovery-path bug with two code-level failures:

1. `canceled` is correctly non-entitled.
2. `determineNonEntitledReason('canceled', true)` returns `manage_billing`.
3. `/pricing` receives/effectively computes `manage_billing`.
4. `PricingView` hides the normal plans and renders only "Subscription needs attention" plus a "Manage Billing" portal action.
5. If the user forces the plan grid to render, `CreateCheckoutSessionUseCase` still blocks checkout for any existing row with `currentPeriodEnd > now`, regardless of status (`src/application/use-cases/create-checkout-session.ts:110-116`). A terminal `canceled` row can therefore block re-subscribe even though the Stripe adapter correctly allows checkout when Stripe subscriptions are only `canceled` / ended.

So a canceled authenticated user can be trapped in a loop:

`/app/*` -> `/pricing?reason=manage_billing` -> Stripe portal -> return -> still canceled -> `/pricing?reason=manage_billing`.

The old copy is also inaccurate for this case: "Manage billing to resolve payment issues" implies a payment failure, but the verified state is Stripe's automatic test-retention cancellation.

---

## Observed Symptom

| Surface | Evidence |
|---|---|
| `/pricing` banner | `"Subscription found. Manage billing to resolve payment issues."` from `reason === 'manage_billing'` at `app/pricing/page.tsx:95-99`. |
| `/pricing` card | `"Subscription needs attention" / "Manage billing in Stripe to restore access."` when `!isEntitled && manageBillingAction` at `app/pricing/pricing-view.tsx:100-116`. |
| `/app/*` redirect | `enforceEntitledAppUser()` redirects non-entitled users to `${ROUTES.PRICING}?reason=${reason}` at `app/(app)/app/layout.tsx:39-42`. |
| Stripe portal screenshot | Shows Test mode, Visa 4242, paid invoices for Mar/Apr/May 2026, but no visible active subscription section. Paid invoices are historical, not proof of current entitlement. |

---

## Verified Runtime Facts

Diagnostics were run read-only from local `.env.local` against the configured Neon database and Stripe test account.

### App database

For `jj@novamindnyc.com`:

```text
user_id: 401079b0-5346-4d91-8b68-03675d769e60
stripe_customer_id: cus_TvnxIbgBSEEqp6
stripe_subscription_id: sub_1SxwUEKItmaHAwgUESbx3reB
db_status: canceled
db_price_id: price_1SxuYAKItmaHAwgUWaePv0AC
db_current_period_end: 2026-06-06T21:22:44.000Z
db_cancel_at_period_end: false
db_updated_at: 2026-05-07T21:51:04.421Z
db_price_matches_monthly: true
```

### Stripe API

For `sub_1SxwUEKItmaHAwgUESbx3reB`:

```text
status: canceled
cancel_at_period_end: false
canceled_at: 2026-05-07T21:50:59.000Z
ended_at: 2026-05-07T21:50:59.000Z
current_period_end: 2026-06-06T21:22:44.000Z
cancellation_details.reason: cancellation_requested
metadata_user_id: 401079b0-5346-4d91-8b68-03675d769e60
price_matches_monthly: true
```

### Webhook/Event Audit

The relevant Stripe event was automatic and successfully processed:

```text
evt_1TUZotKItmaHAwgUVUp6QeIL
type: customer.subscription.deleted
Stripe Dashboard source: Automatic
Stripe event created: 2026-05-07T21:50:59.000Z
DB stripe_events.created_at: 2026-05-07T21:51:04.343Z
DB stripe_events.processed_at: 2026-05-07T21:51:04.444Z
error: empty
```

There were no `clerk_events`, `deleted_clerk_users`, or `pending_stripe_cancellations` rows indicating this was caused by the app's Clerk deletion cancellation path.

### Retention-policy math

```text
created:  2026-02-06T21:22:44.000Z
canceled: 2026-05-07T21:50:59.000Z
delta:    90.0196 days
```

This aligns with Stripe's documented test/sandbox policy: automatic cancellation at 90 days unless the subscription is excluded from auto-cancellation. Because the event API version is `2026-01-28.clover`, Stripe reports `cancellation_details.reason = 'cancellation_requested'`; Stripe's support doc notes newer API versions (`2026-03-25.dahlia` and later) use the clearer `canceled_by_retention_policy` reason for this same retention-policy cancellation.

---

## Decision Chain

The current behavior follows directly from existing code:

1. `/app/*` calls `enforceEntitledAppUser()` (`app/(app)/app/layout.tsx:29-47`).
2. `getRequestAuthState()` reads the current user and calls `CheckEntitlementUseCase.execute()` (`lib/auth-request-cache.ts:37-52, 65-81`).
3. `CheckEntitlementUseCase.execute()` reads one subscription row by user ID (`src/application/use-cases/check-entitlement.ts:25-52`).
4. `isEntitled()` requires an entitled status and a future period end (`src/domain/services/entitlement.ts:12-20`).
5. Entitled statuses are only `'active'`, `'inTrial'`, and `'pastDue'` (`src/domain/value-objects/subscription-status.ts:29-32`).
6. `canceled` is therefore not entitled.
7. Because this canceled row still has a future `current_period_end`, `determineNonEntitledReason('canceled', true)` returns `'manage_billing'` (`src/domain/services/entitlement.ts:22-30`).
8. `/pricing` treats `manage_billing` as a payment-resolution case and wires `manageBillingAction` (`app/pricing/page.tsx:95-99, 131-140`).
9. `PricingView` prioritizes `!isEntitled && manageBillingAction` above the normal plans grid (`app/pricing/pricing-view.tsx:100-117`).
10. The subscribe action cannot currently rescue this state reliably: `CreateCheckoutSessionUseCase` throws `ALREADY_SUBSCRIBED` for any local subscription row whose `currentPeriodEnd` is still future (`src/application/use-cases/create-checkout-session.ts:110-116`), and `runSubscribeAction()` maps `ALREADY_SUBSCRIBED` back to `/pricing?reason=manage_billing` (`app/pricing/subscribe-action.ts:35-37`).

The entitlement function is defensible. The recovery UX is not.

---

## Ruled-Out Root Causes

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Stripe changed test mode behavior | **Ruled out** | Stripe and DB agree on `canceled`; invoices are historical. |
| Vercel/Stripe webhook secret mismatch | **Ruled out for this incident** | `customer.subscription.deleted` processed successfully with empty `error`. Later Stripe events also processed. |
| Missing `subscription.metadata.user_id` | **Ruled out** | Stripe subscription metadata contains the correct local UUID. |
| Price ID drift | **Ruled out** | DB and Stripe price match configured monthly price. |
| Wrong DB | **Ruled out for local diagnostics** | The DB row matches the Stripe customer/subscription shown by the configured test account. |
| Browser cache/session bug | **Ruled out** | Server-side entitlement computes from DB state on request; clearing the browser cannot turn a canceled Stripe subscription active. |
| Customer Portal / Dashboard / friend clicked cancel | **Ruled out for this incident** | Stripe Dashboard event source is `Automatic`, not a user/API-originated cancellation, and the 90-day creation-to-cancellation delta matches Stripe test retention. |

---

## Cancellation Actor Investigation

**Confirmed actor: Stripe test/sandbox subscription retention policy.**

The earlier actor analysis considered Customer Portal clicks, Dashboard clicks, ad-hoc API calls, E2E setup, Clerk deletion, and reconciliation cancellation. Those hypotheses are now obsolete for this incident.

Stripe's own source of truth is decisive:

- The event source is `Automatic` in Stripe Dashboard.
- No `DELETE /v1/subscriptions/...` request exists in the account API logs for `sub_1SxwUEKItmaHAwgUESbx3reB`.
- The subscription was canceled almost exactly 90 days after creation.
- Stripe documents this behavior for test/sandbox subscriptions and says the resulting state/event are the same as explicit cancellation: `status: canceled` plus `customer.subscription.deleted`.

This also explains the otherwise misleading `cancellation_details.reason = 'cancellation_requested'`: the event used API version `2026-01-28.clover`, and Stripe's support doc says retention-policy cancellations before `2026-03-25.dahlia` surface as `cancellation_requested`; newer versions use `canceled_by_retention_policy`.

### Implications

- No Vercel or Stripe secret rotation is indicated by this incident.
- No app code path canceled this subscription.
- No friend/user Portal click is needed to explain the event.
- The same class of test-mode dogfood account will recur every 90 days unless the new subscription is excluded from auto-cancellation.
- Production users are not affected by the 90-day test-retention policy, but they can still hit the same app recovery trap after a real cancellation.

---

## Emergency Unblock (Skip If Fixing Code First)

The preferred path is to ship DEBT-383 and resubscribe through the app UI. Use this manual Stripe Dashboard path only if dogfood access is needed before the fix lands:

1. In Stripe test mode, create a new active monthly subscription for `cus_TvnxIbgBSEEqp6` using the configured monthly price.
2. Ensure the new subscription metadata includes `user_id = 401079b0-5346-4d91-8b68-03675d769e60`.
3. Let the webhook update the DB, or re-send the `customer.subscription.created` / `customer.subscription.updated` event.
4. Mark the new test subscription **excluded from auto-cancellation** in Stripe Dashboard (`Actions` menu on the subscription).
5. Verify DB `stripe_subscriptions.status = 'active'`, `cancel_at_period_end = false`, and `current_period_end > now()`.

Do not simply update the database row to `active`; that would make the app lie about Stripe state.

After DEBT-383 ships, the preferred unblock path becomes the app's own pricing UI:

1. Visit `/pricing` normally while authenticated.
2. See cancellation-specific copy and the plan grid.
3. Subscribe through Stripe Checkout.
4. Mark the resulting test subscription excluded from auto-cancellation in Stripe Dashboard.

Do not rely on a `?reason=subscription_required` query-string workaround. The query string can make the plan grid appear, but current checkout code still treats the terminal canceled row as `ALREADY_SUBSCRIBED` while its old period end is in the future.

---

## Proposed Product Fix

### Option A — Recommended

Split canceled-subscription recovery from payment-management recovery.

Implementation shape:

1. Extend the non-entitled reason model so `canceled` can produce a distinct reason such as `'subscription_canceled'` instead of falling into `'manage_billing'`.
2. Keep `unpaid` / `paused` on a portal-oriented recovery path if Stripe portal is the right place to resolve them.
3. On `/pricing`, render a cancellation-specific banner such as "Your subscription is inactive. Choose a plan to restart access.".
4. For the canceled case, show the normal pricing plans and subscription actions instead of only the "Subscription needs attention" manage-billing card.
5. Keep an optional secondary "Manage Billing" action if useful, but it must not replace the re-subscribe path.
6. Align `CreateCheckoutSessionUseCase` with the Stripe adapter's duplicate-subscription guard: block checkout for active/recoverable/non-terminal statuses (`active`, `inTrial`, `pastDue`, `unpaid`, `paymentProcessing`, `paused`) while allowing terminal statuses (`canceled`, `paymentFailed`) to create a new Checkout Session.

Why this is the right cut:

- Preserves the strict entitlement rule: `canceled` does not grant access.
- Gives canceled users a way back into the product.
- Avoids telling a canceled user they have a payment issue.
- Does not require Stripe read-path calls inside entitlement checks.
- Keeps the duplicate-subscription protection from BUG-101/BUG-052 for non-terminal states while removing the accidental terminal-row dead end.

### Option B — Not Recommended Without Product Decision

Treat `canceled` plus future `current_period_end` as entitled until the period end.

This would be a policy change, not a bug fix. Stripe `status='canceled'` with `ended_at` populated means the subscription has ended even if the last billing period timestamp remains present. The current schema does not store `ended_at`, so implementing this correctly would require extra Stripe fields and a clear access-after-cancellation policy.

---

## Test Plan

Follow TDD before production edits:

1. Domain/use-case tests:
   - `determineNonEntitledReason('canceled', true)` returns the new cancellation-specific reason.
   - `canceled` remains non-entitled.
   - `unpaid` / `paused` keep the intended portal recovery reason.
   - `CreateCheckoutSessionUseCase` allows checkout when the local row is terminal `canceled` even if `currentPeriodEnd` is still future.
   - `CreateCheckoutSessionUseCase` continues to block checkout for active/recoverable non-terminal statuses with future period end.
2. Pricing page tests:
   - Authenticated canceled user sees cancellation-specific copy and the plan grid.
   - Authenticated canceled user is not trapped behind only the manage-billing card.
   - Existing `manage_billing` cases still show the portal recovery action.
3. Browser/E2E coverage if the surface changes are interactive:
   - Canceled user can reach a subscribe CTA from `/pricing`.
   - Entitled user still sees "You're already subscribed".

---

## Out Of Scope

- Scheduling the reconciliation cron as the primary fix for this incident. Reconciliation would preserve `canceled` because Stripe is also canceled.
- Changing webhook signature or Vercel environment variables.
- Hand-editing production/test subscription rows to fake entitlement.
- Reworking Stripe portal configuration unless product decides portal should support subscription restart.
- DEBT-382 implementation; it can resume after this billing trap is either fixed or explicitly deferred.

---

## Acceptance Criteria

DEBT-383 is ready for implementation when:

- [ ] User confirms the desired canceled-subscription recovery policy: show plans immediately (recommended) vs portal-only vs access-through-period.
- [ ] The selected behavior is reflected in the debt doc and tests are listed before production changes.
- [ ] Either an immediate dogfood-account unblock path is chosen, or the user explicitly elects to wait for the code fix before regaining app access.

DEBT-383 is resolved when:

- [ ] A canceled authenticated user can restart access through the app UI without manual DB intervention.
- [ ] Checkout creation is allowed for terminal local subscription rows (`canceled`, `paymentFailed`) and still blocked for non-terminal/current rows.
- [ ] The banner/card copy distinguishes cancellation from payment failure.
- [ ] The affected dogfood account has a verified active Stripe subscription again and that test subscription is excluded from Stripe auto-cancellation, or the user explicitly accepts it as canceled.
- [ ] `docs/debt/index.md` is updated and this file is archived after merge.

---

## Citations

File/line references verified by direct read on 2026-05-13:

- `app/(app)/app/layout.tsx:29-47` — app entitlement redirect.
- `lib/auth-request-cache.ts:37-52, 65-81` — request-scoped auth/entitlement read.
- `src/application/use-cases/check-entitlement.ts:25-52` — subscription row to entitlement output.
- `src/domain/services/entitlement.ts:12-30` — `canceled` is non-entitled and maps to `manage_billing` when period end is future.
- `src/domain/value-objects/subscription-status.ts:29-32` — entitled status allow-list.
- `src/adapters/gateways/stripe/stripe-subscription-status.ts:7-16` — Stripe status mapping.
- `app/pricing/page.tsx:95-99, 131-140` — `manage_billing` banner/action wiring.
- `app/pricing/pricing-view.tsx:100-117` — manage-billing card suppresses normal plan grid.
- `src/application/use-cases/create-checkout-session.ts:110-116` — local checkout guard blocks any future-period row, including terminal `canceled` rows.
- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:21-28, 137-159` — Stripe-side checkout guard blocks active/recoverable statuses but allows `canceled` / `incomplete_expired`.
- `app/pricing/subscribe-action.ts:35-37` — `ALREADY_SUBSCRIBED` redirects back to `manage_billing`.
- `tests/e2e/helpers/seed-test-user.ts:177-185` — E2E helper cancellation behavior reviewed and not proven causal for this account.
- Stripe Support, ["Data retention policy for test subscriptions"](https://support.stripe.com/questions/data-retention-policy-for-test-subscriptions) — test/sandbox subscriptions auto-cancel after 90 days unless excluded; live subscriptions are not subject to this behavior; reason differs before/after API version `2026-03-25.dahlia`.
