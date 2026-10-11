# Stripe Vendor Documentation

**Package:** `stripe` ^22.6.1
**API Version:** `2026-08-26.dahlia` (outbound SDK requests only; webhook endpoints carry their own versions, see [Webhook Endpoint API Versions](#webhook-endpoint-api-versions))
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

Stripe saves the status code and response body from the first request made with an idempotency key, and later requests with the same key return that saved result. Stripe permits pruning only after a key is at least 24 hours old; it does not promise deletion at exactly 24 hours. Replayed create responses for short-lived resources therefore are not proof of current live state. The subscription Checkout adapter keeps deterministic provider keys for concurrency collapse and retrieves each created or replayed Session before deciding from its status and expiry. When that result is inactive, the adapter uses Stripe's newest-first Checkout Session list through a bounded full-metadata scan to seed the existing recovery key from one unique tail; an open tail is live-retrieved and reused only while active, while ambiguity or scan failure retains [DEBT-466](../_archive/debt/debt-466-checkout-idempotency-replay-chain-exhaustion.md)'s bounded deterministic walk. [DEBT-470](../_archive/debt/debt-470-checkout-replay-tail-jump.md) records the provider-contract receipts and implementation bounds.

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
| `customer.subscription.trial_will_end` | `processWebhookEvent` | Subscription synchronization three days before a trial ends |
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

## Webhook Endpoint API Versions

Stripe renders each event payload at the receiving endpoint's API version. An endpoint created without one has `api_version: null` and inherits the account default. `lib/stripe-api-version.ts` sets the version of outbound SDK requests only. It never changes the shape of what `/api/stripe/webhook` receives, and advancing it does not move any endpoint ([Stripe: webhook versioning](https://docs.stripe.com/webhooks/versioning)).

### Census (2026-10-11, read-only, GitHub #883)

| Surface | API version | Evidence |
|---------|-------------|----------|
| Code client pin | `2026-08-26.dahlia` | `lib/stripe-api-version.ts`; `stripe@22.6.2` resolved in `pnpm-lock.yaml` (range `^22.6.1`) |
| Live endpoint `we_1Tejqg…` (`https://addictionboards.com/api/stripe/webhook`) | `2026-05-27.dahlia`, explicit | Enabled; created 2026-06-04 by [DEBT-406](../_archive/debt/debt-406-stripe-live-endpoint-version-reconciliation.md); the only live endpoint |
| Test endpoint (the `dev` branch preview alias) | Found `null`, so the account default; now `2026-05-27.dahlia`, explicit | `we_1T19r…` (created 2026-02-15) had no version. It was replaced on 2026-10-11 by `we_1UPPK…`, see [Test endpoint rotation](#test-endpoint-rotation-2026-10-11). The only test endpoint |
| Account default, live and test | `2026-01-28.clover` | `api_version` on the latest events in both modes |

At the census, both endpoints subscribed to the same seven events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.payment_succeeded` and `invoice.payment_failed`.

Delivery receipts:

- **Live.** Every recent live event checked on 2026-10-11 has `pending_webhooks: 0`. The live endpoint is the only one, so production's `STRIPE_WEBHOOK_SECRET` verifies its signatures. No secret value was read.
- **Test.** The `dev` preview deployment answers deliveries at the inherited Clover version with HTTP 200. Its 500s in the same hour fail with `Stripe subscription metadata.user_id is required`, on subscriptions that the provider-contract trial-clock smoke (`tests/integration/stripe-trial-clock-smoke.integration.test.ts`) creates without user metadata. That failure does not depend on the payload version.

### Decision

Endpoints follow the code pin's **major release** (Dahlia, Endive, …), not each monthly version.

- **Within a major release, the endpoints stay.** Stripe documents that monthly versions add and never break, and that an endpoint can move to any version in the same major release without code changes. The live endpoint therefore stays at `2026-05-27.dahlia` while the client is at `2026-08-26.dahlia`. Recreating it each month would rotate production's signing secret and redeploy, now under live traffic, for no difference the parser can see. `stripe-webhook-schemas.ts` reads only fields that are stable across Dahlia and passes the rest through.
- **At a major release, the endpoints move,** following [Major-release migration](#major-release-migration). The test endpoint goes first.
- **The test endpoint mirrors the live endpoint's version, explicitly.** Preview then receives production's payload shape. An endpoint without a version follows the account default (`2026-01-28.clover`, before Dahlia), which is how Preview came to receive Clover payloads while production received Dahlia ones. Do not align them by upgrading the account default. That also changes how the Events API renders events, and every other caller that relies on the default.

### Event-set gap: handled but not subscribed

The code handles 13 event types ([Webhooks We Handle](#webhooks-we-handle)); at the census the endpoints sent 7. Five of the six never sent report changes to a subscription: `customer.subscription.paused`, `customer.subscription.resumed`, `customer.subscription.pending_update_applied`, `customer.subscription.pending_update_expired` and `invoice.payment_action_required`. A subscribed `customer.subscription.updated` usually reports the same change, but this census did not confirm that for each of them.

`checkout.session.expired` has no such substitute. PR #753 added its handling: a setup-mode add-card session that expires marks its trial payment-method setup operation `expired`. The renewal-notice cron's `pruneExpired` deletes only `expired` operations, so an abandoned add-card session stays `pending` and is never pruned. This confirms the gap that [DEBT-501](../debt/debt-501-billing-operations-resilience.md) item 7 suspected. Subscribing the live endpoint to all 13 handled events closes it. No backfill was needed: a live Stripe check on 2026-10-11 found no missed setup-mode expiry. The live receipt below covers subscription-mode expiry.

Fix status (endpoint configuration only; the version and signing secret are unchanged):

- **Test: 12 of 13 now, 13 once this change reaches the `dev` preview.** In order, on 2026-10-11 UTC:
  1. The census found 7 events.
  2. All 13 were subscribed (15:00Z). A probe subscription-mode Checkout session, created and expired through the API at 15:01:40Z, produced a `checkout.session.expired` event with `pending_webhooks: 0`.
  3. Setup-mode sessions from other test runs then arrived (15:04:26Z, 15:05:15Z), and the preview answered 400 `Stripe webhook validation failed`. Its consent-state secret cannot verify a session signed in another environment, and every E2E run that exercises add-card creates and expires one. `checkout.session.expired` was removed, leaving 12.
  4. The replacement endpoint `we_1UPPK…` was created with those 12 events ([Test endpoint rotation](#test-endpoint-rotation-2026-10-11)).
  5. The webhook now skips such a session when it has an E2E owner and the session's Customer carries a different `e2e_owner` (`unverifiedSetupStateError` in `stripe-webhook-processor.ts`), as it skips another owner's subscription events (`e2e_owner_mismatch`, DEBT-386). Without that evidence, including a Customer tagged with this deployment's own owner or with none, the session stays a 400, so a misconfigured consent-state secret on the `dev` preview is still reported. Nothing is written either way. Production has no E2E owner, so it never makes the lookup and still answers 400. Once this change reaches the `dev` preview, `checkout.session.expired` is added back to `we_1UPPK…`, making 13.
- **Live: done 2026-10-11.** The live endpoint now subscribes to all 13 handled events, with `api_version` still `2026-05-27.dahlia`. A probe subscription-mode Checkout session, created through the API with the minimum 30-minute expiry, expired at 15:39:33Z. Its `checkout.session.expired` event shows `pending_webhooks: 0`, so production acknowledged it.

### Major-release migration

`stripe@23.0.0` (Dependabot #1447) pins `2026-09-30.endive`, the first version of a new major release. Merging it is a major-release boundary, not a monthly advance. Before the pin crosses one:

1. Read the new release's breaking changes against [Fields We Depend On](#fields-we-depend-on) and the schemas in `stripe-webhook-schemas.ts`. During the overlap, payloads from both versions must parse.
2. Recreate the test endpoint at the new version, as in [Test endpoint rotation](#test-endpoint-rotation-2026-10-11), and exercise the handled events against Preview.
3. For live, follow [Stripe's procedure](https://docs.stripe.com/webhooks/versioning): a second endpoint at the new version, distinguished by a query parameter, with only one of the two processed at a time. The route verifies a single `STRIPE_WEBHOOK_SECRET`, so overlapping endpoints need either verification of both secrets or a deliberate swap that relies on Stripe retrying failed deliveries and on the `stripe_events` claim for idempotency. DEBT-406's direct swap was safe because the endpoint had no traffic. It now has live traffic, so choose one approach and record it before changing anything live.
4. Retire the old endpoint only after deliveries to the new one show `pending_webhooks: 0`.

### Test endpoint rotation (2026-10-11)

Stripe fixes an endpoint's version at creation, so the test endpoint was recreated rather than edited. The same recreate-and-swap is step 2 of a major-release migration:

1. Created `we_1UPPK…` at `2026-05-27.dahlia`, with the old endpoint's URL and its 12 events: every handled event except `checkout.session.expired`, for the reason in [Event-set gap](#event-set-gap-handled-but-not-subscribed).
2. Set `STRIPE_WEBHOOK_SECRET` in Vercel Preview and Development to its signing secret, piped from a private file and confirmed by hash, never printed.
3. Redeployed the `dev` preview, so the branch alias serves a build with the new secret.
4. Probed with a test-mode trial subscription tagged with another `e2e_owner`. The new endpoint's deliveries returned 200 (`e2e_owner_mismatch` skip). The old endpoint's returned 400 `Webhook signature verification failed`, as expected once its secret was retired.
5. Deleted the old endpoint `we_1T19r…` and the probe customer.

Each event reaches both endpoints while they overlap, and the `stripe_events` claim makes processing idempotent, so the swap loses no event.

### Census commands

```bash
# Test mode (read-only). List responses never include the signing secret.
stripe webhook_endpoints list --limit 20 \
  | jq '.data[] | {url, status, api_version, enabled_events}'
stripe events list --limit 10 \
  | jq -r '.data[] | "\(.created | todate) \(.type) api_version=\(.api_version) pending=\(.pending_webhooks)"'
# Live mode: add --live once `stripe login` has a current live key, or use the
# Stripe MCP read tools (GetWebhookEndpoints, GetEvents) in livemode.
```

An event read from the Events API shows its data at the account default when it was created. That is not necessarily the version an endpoint received.

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
- [ ] Run the read-only [webhook endpoint census](#census-commands) in live and test mode and put it in the PR: each endpoint's `api_version` (null means the account default), its enabled events against [Webhooks We Handle](#webhooks-we-handle), and `pending_webhooks` on recent events. An SDK or pin change never moves an endpoint, so this is the only check on the version payloads actually arrive at
- [ ] If the new pin starts a new major release (its suffix changes, as Dahlia to Endive), complete the [major-release migration](#major-release-migration) before merging. A monthly advance within the same major release leaves the endpoints where they are, per [the decision](#decision)
- [ ] Update this doc and `docs/vendor-docs/index.md` with the new versions

---

## Sources

- [Stripe API Versioning](https://docs.stripe.com/api/versioning)
- [Stripe Changelog](https://docs.stripe.com/changelog)
- [Stripe API Upgrades](https://docs.stripe.com/upgrades)
- [stripe-node GitHub](https://github.com/stripe/stripe-node)
