# Stripe Vendor Documentation

**Package:** `stripe` ^22.6.1
**API Version:** `2026-08-26.dahlia`
**Dashboard:** https://dashboard.stripe.com
**Docs:** https://docs.stripe.com
**Changelog:** https://docs.stripe.com/changelog

---

## API Version History

| Date | API Version | Impact | Notes |
|------|-------------|--------|-------|
| 2026-08-26 | `2026-08-26.dahlia` | Current | Pinned 2026-09-16 with SDK 22.6.1. Additive GA release: card funding-type restrictions in Checkout, Customer Session entitlement/portal components, Billie for invoices and subscriptions, standardized payment-method error codes. None of the added fields are read or sent by this app. |
| 2026-07-29 | `2026-07-29.dahlia` | Non-breaking | Pinned 2026-08-08 (PR #758, SDK 22.4.0). That upgrade introduced the `known \| OtherString` response-enum modelling described below. |
| 2026-06-24 | `2026-06-24.dahlia` | Non-breaking | Pinned 2026-07-02 (PR #551, SDK 22.3.0) |
| 2026-05-27 | `2026-05-27.dahlia` | Non-breaking | Pinned 2026-06-04 (PR #400, DEBT-404) |
| 2026-04-22 | `2026-04-22.dahlia` | Non-breaking | Pinned 2026-05-24 (PR #332) |
| 2026-03-25 | `2026-03-25.dahlia` | **BREAKING** | Dahlia cutover |
| 2026-01-28 | `2026-01-28.clover` | Historical | Former pinned version |
| 2025-03-31 | `2025-03-31.basil` | **BREAKING** | `current_period_end` moved to items |

Within a named release (Dahlia), Stripe states that only the first version carries breaking changes and every later monthly version is additive. Advancing the pin between monthly Dahlia versions therefore needs a changelog read for fields we touch, not a migration.

**How to check current version:**
```bash
git --no-pager show HEAD:lib/stripe-api-version.ts
```

`lib/stripe-api-version.ts` is the application's explicit API pin. `stripe config --list` displays CLI configuration, not the application's pin or a webhook endpoint's configured version.

---

## SDK Pin Coupling and Response-Enum Widening

`stripe-node` types its `apiVersion` constructor option as the exact string the SDK release pins. A minor SDK bump that advances the pinned version fails `pnpm typecheck` with `Type '"<old>.dahlia"' is not assignable to type '"<new>.dahlia"'` at `lib/stripe.ts` until `lib/stripe-api-version.ts` is advanced with it. The two move together in one PR; never cast around the mismatch (DEBT-404, PR #758).

Since SDK 22.4.0 Stripe types response enums as `'known' | 'values' | OtherString` (`OtherString = string & Record<never, never>`) so integrations handle values that exist in the API before they exist in the SDK. The client-owned port in `src/adapters/shared/stripe-types.ts` mirrors that split:

- **Response fields** are widened with `StripeOtherString`: Checkout Session `mode`, `payment_method_collection`, and `status`; subscription list `status`. Checkout Session status widening arrived in SDK 22.6.0 (pinned to `2026-08-26.dahlia`); this repository mirrored it in the 22.6.1 upgrade.
- **Request filters** stay narrow (`StripeCheckoutSessionListParams.status`, `StripeSubscriptionListParams.status`) so the app can only ask Stripe for values it understands.
- Consumers narrow before acting: `hasRecognizedCheckoutSessionStatus` and `isValidStripeSubscriptionStatus` fail closed on values outside the known set, and `isSessionInactive` treats every reported status other than `open` (including the empty string) as not reusable; only an absent status defers to the expiry check.

A new widening in the SDK surfaces as `Type 'Stripe' is not assignable to type 'StripeClient'` at the composition root. `src/adapters/shared/stripe-types.test.ts` pins the whole contract (`expectTypeOf<Stripe>().toExtend<StripeClient>()`) so the adapter boundary also reports the incompatibility. These `expectTypeOf` contracts are enforced by `pnpm typecheck`, not by Vitest's runtime execution.

---

## Fields We Depend On

### Subscription Object

| Field | Location | Used In | Notes |
|-------|----------|---------|-------|
| `id` | `subscription.id` | Webhook handler | Subscription ID |
| `customer` | `subscription.customer` | Webhook handler | Customer ID |
| `status` | `subscription.status` | Webhook, billing page | `active`, `past_due`, etc. |
| `current_period_end` | **`subscription.items.data[0].current_period_end`** | Webhook, checkout success | **MOVED in 2025-03-31** |
| `cancel_at_period_end` | `subscription.cancel_at_period_end` | Billing page | Boolean |
| `items.data[].price.id` | `subscription.items.data[0].price.id` | Webhook handler | Price ID for plan |
| `metadata.user_id` | `subscription.metadata.user_id` | Webhook handler | Our internal user ID |

### Checkout Session Object

| Field | Location | Used In | Notes |
|-------|----------|---------|-------|
| `id` | `session.id` | Checkout success | Session ID |
| `url` | `session.url` | Subscribe action | Redirect URL |
| `status` | `session.status` | Session reuse and live-retrieval checks | `open` / `complete` / `expired`; unknown values are treated as not reusable |
| `subscription` | `session.subscription` | Checkout success | Expanded subscription |
| `line_items` | `session.line_items` | Session reuse check | Needs `expand` |

## Idempotent Requests

Stripe saves the status code and response body from the first request made with an idempotency key, and later requests with the same key return that saved result. Stripe permits pruning only after a key is at least 24 hours old; it does not promise deletion at exactly 24 hours. Replayed create responses for short-lived resources therefore are not proof of current live state. The subscription Checkout adapter keeps deterministic provider keys for concurrency collapse and retrieves each created or replayed Session before deciding from its status and expiry. When that result is inactive, the adapter uses Stripe's newest-first Checkout Session list through a bounded full-metadata scan to seed the existing recovery key from one unique tail; an open tail is live-retrieved and reused only while active, while ambiguity or scan failure retains [DEBT-466](../debt/debt-466-checkout-idempotency-replay-chain-exhaustion.md)'s bounded deterministic walk. [DEBT-470](../debt/debt-470-checkout-replay-tail-jump.md) records the provider-contract receipts and implementation bounds.

**Docs:** https://docs.stripe.com/api/idempotent_requests

---

## Breaking Changes We've Hit

### BUG-045: `current_period_end` Moved to Items (2025-03-31)

**What broke:** Checkout success page and webhooks read `subscription.current_period_end`, which is absent on API >= `2025-03-31` (`undefined` when read in JavaScript).

**Stripe changelog:** https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end

**Fix:**
```typescript
// OLD (broken)
subscription.current_period_end  // undefined: property removed

// NEW (correct)
subscription.items.data[0].current_period_end  // number
```

**Affected files:**
- `app/(marketing)/checkout/success/page.tsx`
- `src/adapters/gateways/stripe-payment-gateway.ts`

**Detection:** Would have caught this if we searched changelog for "current_period" before upgrading.

---

## Webhooks We Handle

| Event | Handler | Purpose |
|-------|---------|---------|
| `customer.subscription.created` | `processWebhookEvent` | New subscription (may lack metadata) |
| `customer.subscription.updated` | `processWebhookEvent` | Status changes, renewals |
| `customer.subscription.deleted` | `processWebhookEvent` | Cancellation |
| `customer.subscription.paused` | `processWebhookEvent` | Pause (if enabled) |
| `customer.subscription.resumed` | `processWebhookEvent` | Resume from pause |
| `customer.subscription.pending_update_applied` | `processWebhookEvent` | Scheduled change applied |
| `customer.subscription.pending_update_expired` | `processWebhookEvent` | Scheduled change expired |
| `checkout.session.completed` | `processWebhookEvent` | Subscription synchronization and initial consent; setup-mode trial payment-method completion |
| `checkout.session.expired` | `processWebhookEvent` | Subscription synchronization; setup-mode trial payment-method expiration |
| `invoice.payment_action_required` | `processWebhookEvent` | Synchronize the referenced subscription when payment needs action |
| `invoice.payment_failed` | `processWebhookEvent` | Synchronize the referenced subscription after payment failure |
| `invoice.payment_succeeded` | `processWebhookEvent` | Synchronize the referenced subscription after successful payment |

The gateway's `processWebhookEvent` delegates to `processStripeWebhookEvent` in `src/adapters/gateways/stripe/stripe-webhook-processor.ts`.

**Webhook endpoint:** `/api/stripe/webhook`

**Webhook secret:** `STRIPE_WEBHOOK_SECRET` env var

---

## E2E Test Seeding (API-Based)

**Keep Stripe-owned DOM outside required PR CI.** Under DEBT-471, required E2E uses the Stripe API and CLI for provider-backed Checkout contracts and may verify the redirect to `checkout.stripe.com`, but must not interact with Stripe-owned markup. Hosted-DOM journeys remain in `stripe-hosted-*.spec.ts`, selected only by the scheduled/manual `stripe-hosted` project (`pnpm test:e2e:stripe-hosted`). That observational lane detects hosted-page drift without making Stripe's markup a merge dependency.

Our E2E tests seed subscriptions in `global.setup.ts` via `seedTestSubscription()` (`tests/e2e/helpers/seed-test-user.ts`), which:

1. Creates or finds a Stripe customer via `stripe.customers.list({ email })` / `stripe.customers.create()`
2. Attaches `pm_card_visa` (Stripe's built-in test payment method) as the default payment method
3. Creates a subscription via `stripe.subscriptions.create()` with the monthly price ID
4. Mirrors all data into `users`, `stripe_customers`, and `stripe_subscriptions` tables

**Key test payment methods:**

| Token | Card | Use Case |
|-------|------|----------|
| `pm_card_visa` | 4242 4242 4242 4242 | Succeeds immediately |
| `pm_card_visa_debit` | 4000 0566 5566 5556 | Debit card |
| `pm_card_chargeDeclined` | 4000 0000 0000 0002 | Decline testing |

**Docs:** https://docs.stripe.com/testing#test-payment-methods

---

## Test Mode vs Live Mode

| Environment | API Key Prefix | Webhook Secret |
|-------------|---------------|----------------|
| Development | `sk_test_` | `whsec_` (test) |
| Production | `sk_live_` | `whsec_` (live) |

**CLI for local testing:**
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

---

## Upgrade Checklist

When upgrading Stripe SDK or API version:

- [ ] Read the [changelog](https://docs.stripe.com/changelog) entry for the new API version and the [stripe-node release notes](https://github.com/stripe/stripe-node/releases); grep the codebase for every field or enum the notes mark `⚠️`
- [ ] Search codebase for deprecated fields: `current_period_start`, `current_period_end` at subscription level
- [ ] Advance `lib/stripe-api-version.ts` in the same PR as the SDK bump; update the "Last reviewed" date in `lib/stripe.ts`
- [ ] Run `pnpm typecheck` — a `Stripe` → `StripeClient` assignability error means a response enum widened; widen the matching response type in `src/adapters/shared/stripe-types.ts` (never the request filter) and extend `stripe-types.test.ts`
- [ ] Run the full gate including `pnpm test:e2e` — the required Checkout contract proves real TEST-mode Sessions and the success-sync path. `tests/integration/webhook-signature-ingress.integration.test.ts` separately verifies signed webhook ingress through the route handlers; neither contract proves live delivery from Stripe to a deployed endpoint.
- [ ] Update this doc and `docs/vendor-docs/index.md` with the new versions

---

## Sources

- [Stripe API Versioning](https://docs.stripe.com/api/versioning)
- [Stripe Changelog](https://docs.stripe.com/changelog)
- [Stripe API Upgrades](https://docs.stripe.com/upgrades)
- [stripe-node GitHub](https://github.com/stripe/stripe-node)
