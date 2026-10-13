# Stripe Vendor Documentation

**Package:** `stripe` (version: `package.json`)
**API Version:** `2026-09-30.endive`, pinned in `lib/stripe-api-version.ts` (outbound SDK requests only; webhook endpoints carry their own versions, see [Webhook Endpoint API Versions](#webhook-endpoint-api-versions))
**Dashboard:** https://dashboard.stripe.com
**Docs:** https://docs.stripe.com
**Changelog:** https://docs.stripe.com/changelog

---

## API Version History

| Date | API Version | Impact | Notes |
|------|-------------|--------|-------|
| 2026-09-30 | `2026-09-30.endive` | **BREAKING** | Endive cutover, pinned 2026-10-13 with SDK 23.0.0 (PR #1483, issue #1479). Checkout Session create no longer accepts `payment_method_types` and answers it with a 400, so the add-card session sends `allowed_payment_method_types: ['card']` instead. Every other Endive breaking change was checked against what the app sends and reads, and none applies. The test endpoint moved on 2026-10-13, and the live endpoint moves with the promotion that ships PR #1483, per [Endive migration](#endive-migration-2026-10). |
| 2026-08-26 | `2026-08-26.dahlia` | Non-breaking | Pinned 2026-09-16 with SDK 22.6.1. Additive GA release: card funding-type restrictions in Checkout, Customer Session entitlement/portal components, Billie for invoices and subscriptions, standardized payment-method error codes. None of the added fields are read or sent by this app. |
| 2026-07-29 | `2026-07-29.dahlia` | Non-breaking | Pinned 2026-08-08 (PR #758, SDK 22.4.0). That upgrade introduced the `known \| OtherString` response-enum modelling described below. |
| 2026-06-24 | `2026-06-24.dahlia` | Non-breaking | Pinned 2026-07-02 (PR #551, SDK 22.3.0) |
| 2026-05-27 | `2026-05-27.dahlia` | Non-breaking | Pinned 2026-06-04 (PR #400, DEBT-404) |
| 2026-04-22 | `2026-04-22.dahlia` | Non-breaking | Pinned 2026-05-24 (PR #332) |
| 2026-03-25 | `2026-03-25.dahlia` | **BREAKING** | Dahlia cutover |
| 2026-01-28 | `2026-01-28.clover` | Historical | Former pinned version |
| 2025-03-31 | `2025-03-31.basil` | **BREAKING** | `current_period_end` moved to items |

Within a named release (Dahlia, Endive), Stripe states that only the first version carries breaking changes and every later monthly version is additive. Advancing the pin between monthly versions of one release therefore needs a changelog read for fields we touch, not a migration.

**How to check current version:**
```bash
git --no-pager show HEAD:lib/stripe-api-version.ts
```

`lib/stripe-api-version.ts` is the application's explicit API pin. `stripe config --list` displays CLI configuration, not the application's pin or a webhook endpoint's configured version.

---

## SDK Pin Coupling and Response-Enum Widening

`stripe-node` types its `apiVersion` constructor option as the exact string the SDK release pins. A minor SDK bump that advances the pinned version fails `pnpm typecheck` with `Type '"<old pin>"' is not assignable to type '"<new pin>"'` at `lib/stripe.ts` until `lib/stripe-api-version.ts` is advanced with it. The two move together in one PR; never cast around the mismatch (DEBT-404, PR #758).

Since SDK 22.4.0 Stripe types response enums as `'known' | 'values' | OtherString` (`OtherString = string & Record<never, never>`) so integrations handle values that exist in the API before they exist in the SDK. The client-owned port in `src/adapters/shared/stripe-types.ts` mirrors that split:

- **Response fields** are widened with `StripeOtherString`: Checkout Session `mode`, `payment_method_collection`, and `status`; subscription list `status`. Checkout Session status widening arrived in SDK 22.6.0 (pinned to `2026-08-26.dahlia`); this repository mirrored it in the 22.6.1 upgrade.
- **Request filters** stay narrow (`StripeCheckoutSessionListParams.status`, `StripeSubscriptionListParams.status`) so the app can only ask Stripe for values it understands.
- Consumers narrow before acting: `hasRecognizedCheckoutSessionStatus` and `isValidStripeSubscriptionStatus` fail closed on values outside the known set, and `isSessionInactive` treats every reported status other than `open` (including the empty string) as not reusable; only an absent status defers to the expiry check.

A new widening in the SDK surfaces as `Type 'Stripe' is not assignable to type 'StripeClient'` at the composition root. `src/adapters/shared/stripe-types.test.ts` pins the whole contract (`expectTypeOf<Stripe>().toExtend<StripeClient>()`) so the adapter boundary also reports the incompatibility. These `expectTypeOf` contracts are enforced by `pnpm typecheck`, not by Vitest's runtime execution.

A major release can also remove a request field, and the SDK release that pins it drops the field from its request types. `stripe-types.test.ts` therefore also checks the field names of each request parameter type in the port against the installed SDK's, at every depth ("sends only request fields the pinned API version accepts"). A field the port still sends, and the SDK no longer knows, fails `pnpm typecheck` at that request type's assertion, rather than as a 400 at runtime. It checks names, not values: the SDK types request enums open-ended, so a removed enum value still needs the changelog read. Endive's removal of Checkout's `payment_method_types` is the case that prompted it (PR #1483): before this check, only E2E would have caught it.

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

Stripe saves the status code and response body from the first request made with an idempotency key, and later requests with the same key return that saved result. Stripe permits pruning only after a key is at least 24 hours old; it does not promise deletion at exactly 24 hours. Replayed create responses for short-lived resources therefore are not proof of current live state. The subscription Checkout adapter keeps deterministic provider keys for concurrency collapse and retrieves each created or replayed Session before deciding from its status and expiry. When that result is inactive, the adapter uses Stripe's newest-first Checkout Session list through a bounded full-metadata scan to seed the existing recovery key from one unique tail; an open tail is live-retrieved and reused only while active, while ambiguity or scan failure retains [DEBT-466](../../_archive/debt/debt-466-checkout-idempotency-replay-chain-exhaustion.md)'s bounded deterministic walk. [DEBT-470](../../_archive/debt/debt-470-checkout-replay-tail-jump.md) records the provider-contract receipts and implementation bounds.

Two tabs can still open Sessions for different plans at the same moment. After each create, the adapter lists the customer's open Sessions (up to ten), keeps the newest still-active one that carries renewal metadata, and expires the other active ones (`reconcileOpenCheckoutSessionsAfterCreate`, BUG-245). The Stripe Dashboard's Checkout setting "limit customers to one subscription", which the owner turned on in live mode, redirects a customer who already holds an active, past-due, unpaid or paused subscription away from Checkout to manage it. Stripe documents it as that redirect, not as a check at completion, and its list of statuses leaves out `trialing`. Keep that setting on: nothing in this repository sets or checks it.

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

**Webhook secret:** `STRIPE_WEBHOOK_SECRET` env var. While a [major-release migration](#major-release-migration) overlaps two live endpoints, the route also verifies `STRIPE_WEBHOOK_SECRET_NEXT`.

---

## Webhook Endpoint API Versions

Stripe renders each event payload at the receiving endpoint's API version. An endpoint created without one has `api_version: null` and inherits the account default. `lib/stripe-api-version.ts` sets the version of outbound SDK requests only. It never changes the shape of what `/api/stripe/webhook` receives, and advancing it does not move any endpoint ([Stripe: webhook versioning](https://docs.stripe.com/webhooks/versioning)).

### Census (2026-10-11, read-only, GitHub #883)

| Surface | API version | Evidence |
|---------|-------------|----------|
| Code client pin | `2026-08-26.dahlia`; `2026-09-30.endive` from #1483 | `lib/stripe-api-version.ts`; `stripe@22.6.2` resolved in `pnpm-lock.yaml` (range `^22.6.1`), then `stripe@23.0.0` |
| Live endpoint `we_1Tejqg…` (`https://addictionboards.com/api/stripe/webhook`) | `2026-05-27.dahlia`, explicit | Enabled; created 2026-06-04 by DEBT-406; the only live endpoint |
| Test endpoint (the `dev` branch preview alias) | Found `null`, so the account default; `2026-05-27.dahlia`, explicit, from 2026-10-11; now `2026-09-30.endive`, explicit | `we_1T19r…` (created 2026-02-15) had no version. It was replaced on 2026-10-11 by `we_1UPPK…`, see [Test endpoint rotation](#test-endpoint-rotation-2026-10-11), and on 2026-10-13 by `we_1UQ2wp…` at `2026-09-30.endive`, see [Endive migration](#endive-migration-2026-10). The only test endpoint |
| Account default, live and test | `2026-01-28.clover` | `api_version` on the latest events in both modes |

At the census, both endpoints subscribed to the same seven events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.payment_succeeded` and `invoice.payment_failed`.

Delivery receipts:

- **Live.** Every recent live event checked on 2026-10-11 has `pending_webhooks: 0`. The live endpoint is the only one, so production's `STRIPE_WEBHOOK_SECRET` verifies its signatures. No secret value was read.
- **Test (at the census, before the rotation).** The `dev` preview deployment answered deliveries at the inherited Clover version with HTTP 200. Its 500s in the same hour failed with `Stripe subscription metadata.user_id is required`, on subscriptions that the provider-contract trial-clock smoke (`tests/integration/stripe-trial-clock-smoke.integration.test.ts`) creates without user metadata. That failure does not depend on the payload version.
- **Test (2026-10-12).** The trial-clock smoke's subscriptions are now skipped with a 200 (`metadata_missing`). The remaining failures came from the Checkout client contract (`tests/integration/stripe-checkout-client-contract.integration.test.ts`). Its subscriptions carried `user_id: 'debt472_contract_user'` and no `e2e_owner`, so each event reached the database with a `user_id` that is not a UUID and failed with Postgres `22P02`, and Stripe retried it. Those subscriptions now carry `e2e_owner: 'stripe-provider-contract'`, and the `dev` preview skips them as another owner's. The 06:55Z provider-lane run had left 14 events undelivered. A run at 07:59Z, with the tag, left none. Events from earlier runs retry until Stripe's three-day retry window ends.

### Decision

Endpoints follow the code pin's **major release** (Dahlia, Endive, …), not each monthly version.

- **Within a major release, the endpoints stay.** Stripe documents that monthly versions add and never break, and that an endpoint can move to any version in the same major release without code changes. Under Dahlia, the live endpoint therefore stayed at `2026-05-27.dahlia` while the client moved to `2026-08-26.dahlia`. Recreating it each month would rotate production's signing secret and redeploy, now under live traffic, for no difference the parser can see. `stripe-webhook-schemas.ts` reads only fields that are stable within a major release and passes the rest through.
- **At a major release, the endpoints move,** following [Major-release migration](#major-release-migration). The test endpoint goes first.
- **The test endpoint mirrors the live endpoint's version, explicitly,** except while a major-release migration has moved it first. Preview then receives production's payload shape. An endpoint without a version follows the account default (`2026-01-28.clover`, before Dahlia), which is how Preview came to receive Clover payloads while production received Dahlia ones. Do not align them by upgrading the account default. That also changes how the Events API renders events, and every other caller that relies on the default.

### Event-set gap: handled but not subscribed

The code handles 13 event types ([Webhooks We Handle](#webhooks-we-handle)); at the census the endpoints sent 7. Five of the six never sent report changes to a subscription: `customer.subscription.paused`, `customer.subscription.resumed`, `customer.subscription.pending_update_applied`, `customer.subscription.pending_update_expired` and `invoice.payment_action_required`. A subscribed `customer.subscription.updated` usually reports the same change, but this census did not confirm that for each of them.

`checkout.session.expired` has no such substitute. PR #753 added its handling: a setup-mode add-card session that expires marks its trial payment-method setup operation `expired`. The renewal-notice cron's `pruneExpired` deletes only `expired` operations, so an abandoned add-card session stays `pending` and is never pruned. This confirms the gap that DEBT-501 item 7 suspected. Subscribing the live endpoint to all 13 handled events closes it. No backfill was needed: a live Stripe check on 2026-10-11 found no missed setup-mode expiry. The live receipt below covers subscription-mode expiry.

Fix status (endpoint configuration only; the version and signing secret are unchanged):

- **Test: done 2026-10-12.** In order, on 2026-10-11 UTC unless dated:
  1. The census found 7 events.
  2. All 13 were subscribed (15:00Z). A probe subscription-mode Checkout session, created and expired through the API at 15:01:40Z, produced a `checkout.session.expired` event with `pending_webhooks: 0`.
  3. Setup-mode sessions from other test runs then arrived (15:04:26Z, 15:05:15Z), and the preview answered 400 `Stripe webhook validation failed`. Its consent-state secret cannot verify a session signed in another environment, and every E2E run that exercises add-card creates and expires one. `checkout.session.expired` was removed, leaving 12.
  4. The replacement endpoint `we_1UPPK…` was created with those 12 events ([Test endpoint rotation](#test-endpoint-rotation-2026-10-11)).
  5. The webhook now skips such a session when it has an E2E owner and the session's Customer carries a different `e2e_owner` or is gone (`unverifiedSetupStateError` in `stripe-webhook-processor.ts`), as it skips another owner's subscription events (`e2e_owner_mismatch`, DEBT-386). A gone Customer counts because E2E teardown deletes its Customers, often before Stripe delivers the event, and with the Customer gone nothing is left to act on. A test-mode check on 2026-10-12 found that every CI run's add-card session named a Customer teardown had already deleted, while local runs' Customers persisted with their `e2e_owner`. A live Customer without that evidence, tagged with this deployment's own owner or with none, keeps the session a 400, so a misconfigured consent-state secret on the `dev` preview is still reported. Nothing is written either way. Production has no E2E owner, so it never makes the lookup and still answers 400.
  6. On 2026-10-12, once that change was serving on the `dev` preview (07:55:58Z), `checkout.session.expired` was added back to `we_1UPPK…`, making 13, still at `2026-05-27.dahlia`. Two test-mode probes, each an add-card setup session with a consent-state signature from another environment, were expired at 07:56:43Z. One named a Customer tagged with a foreign `e2e_owner`, the other a Customer deleted first, as E2E teardown deletes them. The preview answered both with a 200 skip (`foreign_environment` and `customer_gone`), and both events show `pending_webhooks: 0`.
- **Live: done 2026-10-11.** The live endpoint now subscribes to all 13 handled events, with `api_version` still `2026-05-27.dahlia`. A probe subscription-mode Checkout session, created through the API with the minimum 30-minute expiry, expired at 15:39:33Z. Its `checkout.session.expired` event shows `pending_webhooks: 0`, so production acknowledged it.

### Major-release migration

A pin that moves to a new major release (Dahlia to Endive) crosses a major-release boundary, not a monthly advance. Steps 1 and 2 come before the pin merges, step 3 rides the promotion that ships it, and step 4 follows:

1. Read the new release's breaking changes against [Fields We Depend On](#fields-we-depend-on) and the schemas in `stripe-webhook-schemas.ts`. During the overlap, payloads from both versions must parse.
2. Recreate the test endpoint at the new version, as in [Test endpoint rotation](#test-endpoint-rotation-2026-10-11), and exercise the handled events against Preview.
3. For live, **overlap the two endpoints, then retire the old one** (decided 2026-10-13, PR #1483):
   - **Expand.** Create the live endpoint at the new version, with the same URL and events, and disable it at once. Put its signing secret in production's `STRIPE_WEBHOOK_SECRET_NEXT`, which the route verifies alongside `STRIPE_WEBHOOK_SECRET` (`stripe-webhook-signature.ts`). The promotion that ships the pin deploys both. Then enable the new endpoint. Every event now reaches both endpoints, both deliveries verify, and the `stripe_events` claim (insert on conflict, then a row lock) processes the event once.
   - **Overlap: the rollback window.** Both endpoints stay enabled for at least a week. Vercel's Instant Rollback serves a deployment with the environment variables it was built with ([Vercel: Instant Rollback](https://vercel.com/docs/deployments/instant-rollback)), so a deployment from before the promotion knows only the old secret. With the old endpoint still enabled, it keeps receiving deliveries it can verify, and Stripe retries the new endpoint's until production rolls forward. A rollback needs no extra step.
   - **Contract.** Disable the old endpoint, then set `STRIPE_WEBHOOK_SECRET` to the new secret and remove `STRIPE_WEBHOOK_SECRET_NEXT`. The next promotion deploys that. Disable rather than delete, as [Stripe's procedure](https://docs.stripe.com/webhooks/versioning) does: a disabled endpoint keeps its secret, so a rollback below the promotion only needs the old endpoint enabled again first. The [rollback floor](../../guides/release/promote-to-production.md#keyed-action-output-compatibility) records that. Delete the old endpoint at the next major-release migration.
   - **Why no event is lost or misapplied.** Production accepts both endpoints' deliveries throughout, so none is rejected on purpose. Arrival order cannot regress state, because the processor takes only the subscription's ID from a subscription event and reads the current subscription from Stripe.
   - **Rejected: a direct secret swap.** It needs no code, but it rejects one endpoint's deliveries on purpose through the cutover. Once the old endpoint is gone, an Instant Rollback to any earlier deployment would reject every delivery without an obvious error. The previous release must stay a valid rollback target.
   - **Rejected: upgrading the account default,** for the reason under [Decision](#decision).
   - **Not yet adopted: thin events.** Stripe's thin events carry no versioned payload, which would end endpoint migrations ([Stripe: webhook versioning](https://docs.stripe.com/webhooks/versioning)). The processor already reads current state from Stripe, which is the shape thin events need, but moving to them is its own change.
4. Retire the old endpoint only when nothing is left that only it could deliver: the [owed-events query](#census-commands) returns no event that only the old endpoint is owed. `pending_webhooks` cannot be the test, because it does not drop when the endpoint an event was owed to is deleted.

### Test endpoint rotation (2026-10-11)

Stripe fixes an endpoint's version at creation, so the test endpoint was recreated rather than edited. The same recreate-and-swap is step 2 of a major-release migration:

1. Created `we_1UPPK…` at `2026-05-27.dahlia`, with the old endpoint's URL and its 12 events: every handled event except `checkout.session.expired`, for the reason in [Event-set gap](#event-set-gap-handled-but-not-subscribed).
2. Set `STRIPE_WEBHOOK_SECRET` in Vercel Preview and Development to its signing secret, piped from a private file and confirmed by hash, never printed.
3. Redeployed the `dev` preview, so the branch alias serves a build with the new secret.
4. Probed with a test-mode trial subscription tagged with another `e2e_owner`. The new endpoint's deliveries returned 200 (`e2e_owner_mismatch` skip). The old endpoint's returned 400 `Webhook signature verification failed`, as expected once its secret was retired.
5. Deleted the old endpoint `we_1T19r…` and the probe customer, once the probe's events showed the new endpoint's acknowledgement with only the old endpoint's delivery outstanding (`pending_webhooks: 1`).

Each event reaches both endpoints while they overlap, and the `stripe_events` claim makes processing idempotent, so the swap loses no event.

### Endive migration (2026-10)

The [major-release migration](#major-release-migration) for `2026-09-30.endive` (issue #1479, PR #1483, superseding Dependabot's #1447).

**Test side: done 2026-10-13.**

1. Created `we_1UQ2wp…` at `2026-09-30.endive` at 10:28:43Z, with the URL, description and 13 events of `we_1UPPK…`.
2. Set `STRIPE_WEBHOOK_SECRET` in Vercel Preview and Development to its signing secret, from a private file. A pull of Preview matched it by hash; the secret was never printed.
3. Redeployed the `dev` preview (`dpl_6nwyb…`, still `dev`'s Dahlia code), so it verified only the new endpoint.
4. Probed at Endive with objects tagged `e2e_owner: endive-rotation-probe`: a trial subscription created, updated and canceled, and an add-card-shaped setup Session, expired.
   - The new endpoint's five deliveries parsed, and the preview skipped each with a 200. They were `customer.subscription.created`, `.updated` and `.deleted`, `invoice.payment_succeeded` (all `e2e_owner_mismatch`) and `checkout.session.expired` (`foreign_environment`). Dahlia code therefore parsed these five event types at Endive. The audit found no Endive change to a field that any handled event's schema reads.
   - The old endpoint's deliveries failed signature verification, as expected, so each event showed `pending_webhooks: 1`.
5. Deleted `we_1UPPK…` and the probe Customer. No event since 09:00Z was owed only to the old endpoint. Older test events from the 2026-10-12 06:55Z provider-lane run were still being retried to it and failing, as recorded under [Census](#census-2026-10-11-read-only-github-883); deleting it ended those retries. The lesson is in step 4 of the migration: an event's `pending_webhooks` stayed at 1 after the endpoint it was owed to was deleted, so the owed-events query is the check, and it has to cover every event, not a recent window.
6. At 14:02Z, resent `evt_1UQ2r3…`, created at 10:22:45Z before `we_1UQ2wp…` existed, to `we_1UQ2wp…` with `stripe events resend <event> --webhook-endpoint <endpoint>`. The preview verified it with the new secret and acknowledged it. A resend can therefore reach an endpoint created after the event, a way to deliver anything an endpoint is still owed.

The same probe confirmed Endive's Checkout change against the API itself. A setup Session sent with `payment_method_types` gets a 400 `invalid_request_error` that names the parameter. One sent as the adapter now sends it opens: `allowed_payment_method_types: ['card']`, `consent_collection`, `customer_email`, and no Customer. Its response still lists `payment_method_types: ['card']`, which the E2E consent helper reads.

**Live side: with the promotion that ships PR #1483.** Every step that changes live state needs the owner's go-ahead.

1. Take the census. On 2026-10-13 there was one live endpoint, `we_1Tejqg…`: enabled, at `2026-05-27.dahlia`, with all 13 handled events. No live event was owed a delivery. The live default payment-method configuration had card available and on, which `allowed_payment_method_types: ['card']` needs, because it filters the enabled methods rather than naming them.
2. Once the promotion PR is open and its CI has passed, create the live endpoint at `2026-09-30.endive`, with the same URL, description and 13 events, and disable it straight away.
   - The response holds the signing secret. Under `umask 077`, extract the `secret` field alone into a private file (`jq -j .secret`). Never print it.
   - Don't create the endpoint through a tool that prints its response into a transcript, such as the Stripe MCP write tool. Use the Stripe CLI with a live key, or the Dashboard.
3. `vercel env add STRIPE_WEBHOOK_SECRET_NEXT production --sensitive < "$SECRET_FILE"`. Production's variables are sensitive and cannot be pulled back to compare, so step 6's probe is the check.
4. After `git fetch`, merge the promotion with `pnpm exec tsx scripts/verify-promotion.ts <PR> --merge`. Its production deployment carries the pin and both secrets. Vercel holds the alias until `main`'s CI passes.
5. Once a production deployment of the promotion's merge commit is ready on the production domain and `/api/health` answers 200, enable the new endpoint.
6. Verify with a live probe event: a subscription-mode Checkout Session created and expired through the API, as on 2026-10-11. Both endpoints must acknowledge it, so it ends with `pending_webhooks: 0`. If it doesn't, disable the new endpoint again: production is still served by the old one.
7. After at least a week of overlap, contract:
   1. Check that the owed-events query returns no event owed only to the old endpoint.
   2. Disable `we_1Tejqg…`.
   3. Set `STRIPE_WEBHOOK_SECRET` in production to the new endpoint's secret, from the step 2 file or revealed on its Dashboard page, and remove `STRIPE_WEBHOOK_SECRET_NEXT`.
   4. The next promotion deploys this. A probe after it must again end with `pending_webhooks: 0`.
8. Record the receipts here, update the [census](#census-2026-10-11-read-only-github-883) row, and close #1447 as superseded.

### Census commands

```bash
# Test mode (read-only). List responses never include the signing secret.
stripe webhook_endpoints list --limit 20 \
  | jq '.data[] | {url, status, api_version, enabled_events}'
stripe events list --limit 10 \
  | jq -r '.data[] | "\(.created | todate) \(.type) api_version=\(.api_version) pending=\(.pending_webhooks)"'
# Live mode: add --live once `stripe login` has a current live key, or use the
# Stripe MCP read tools (GetWebhookEndpoints, GetEvents) in livemode.

# Owed-events query: every event still owed a delivery to some endpoint,
# including one since deleted. Page with starting_after until has_more is
# false; add -d "created[lte]=<unix time>" to stop at an endpoint's creation.
stripe events list --limit 100 -d delivery_success=false \
  | jq -r '.data[] | "\(.id) \(.created | todate) \(.type) pending=\(.pending_webhooks)"'
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
- [ ] Run `pnpm typecheck` — a `Stripe` → `StripeClient` assignability error means a response enum widened; widen the matching response type in `src/adapters/shared/stripe-types.ts` (never the request filter) and extend `stripe-types.test.ts`. A failure in "sends only request fields the pinned API version accepts" means the SDK removed a field the port sends; move the port to the replacement the changelog names
- [ ] Run the full gate including `pnpm test:e2e` — the required Checkout contract proves real TEST-mode Sessions and the success-sync path. `tests/integration/webhook-signature-ingress.integration.test.ts` separately verifies signed webhook ingress through the route handlers; neither contract proves live delivery from Stripe to a deployed endpoint.
- [ ] Run the read-only [webhook endpoint census](#census-commands) in live and test mode and put it in the PR: each endpoint's `api_version` (null means the account default), its enabled events against [Webhooks We Handle](#webhooks-we-handle), and `pending_webhooks` on recent events. An SDK or pin change never moves an endpoint, so this is the only check on the version payloads actually arrive at
- [ ] If the new pin starts a new major release (its suffix changes, as Dahlia to Endive), complete the test side of the [major-release migration](#major-release-migration) before merging. The live endpoints then overlap from the promotion that ships the pin, and the old one is retired after the rollback window. A monthly advance within the same major release leaves the endpoints where they are, per [the decision](#decision)
- [ ] Update this doc and `docs/architecture/integrations/README.md` with the new versions

---

## Sources

- [Stripe API Versioning](https://docs.stripe.com/api/versioning)
- [Stripe Changelog](https://docs.stripe.com/changelog)
- [Stripe API Upgrades](https://docs.stripe.com/upgrades)
- [stripe-node GitHub](https://github.com/stripe/stripe-node)
