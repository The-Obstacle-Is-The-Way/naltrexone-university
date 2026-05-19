# DEBT-386: E2E Stripe Customer Ownership Drift Causes Webhook 500s

**Priority:** P2
**Created:** 2026-05-15
**Source:** Follow-up investigation after DEBT-384 was merged, archived, and the debt register was synchronized. Stripe still showed undelivered test-mode webhook events after PR #310, but the payloads no longer matched the missing-`metadata.user_id` failure that DEBT-384 fixed.
**Related:** [DEBT-384 archived](./debt-384-stripe-webhook-error-rate-investigation.md), [DEBT-385 invoice schema drift](../../debt/debt-385-stripe-invoice-event-subscription-ref-schema-drift.md), [DEBT-293 E2E shared state](./debt-293-e2e-shared-state-structural-flakiness.md), [DEBT-306 Stripe customer search/create race](./debt-306-stripe-customer-search-create-race.md)
**Status:** Resolved - PR #311 shipped the code-fixable T2/T3 work and this doc was archived on 2026-05-16. Post-merge ops verification on 2026-05-19 confirmed the dev-preview Vercel owner env var is applied and redeployed, both test-mode and live Stripe endpoints include `customer.subscription.created`, and live mode has zero currently undelivered events. Remaining test-mode undelivered events are historical pre-fix deliveries; no post-fix event accumulation is observed.

---

## Summary

DEBT-384 fixed one real webhook failure mode: `customer.subscription.*` events for subscriptions with no `metadata.user_id` now skip with HTTP 200 instead of returning HTTP 500.

After that merge, Stripe still reported undelivered test-mode webhook events. Re-checking from first principles showed these newer events are different:

- They are `customer.subscription.updated` events.
- They all include `metadata.user_id`.
- Vercel logs show the actual exception is `ApplicationError: Stripe customer id is already mapped to a different user`.

The confirmed source is cross-environment ownership drift in the E2E Stripe seed path. The E2E helper reuses the same Stripe customer and active subscription for the same E2E email across independent databases. Each database has its own random `users.id` for that E2E email, so the helper can rewrite the active subscription's `metadata.user_id` to a user ID that does not belong to the database behind the dev-preview webhook endpoint. The dev webhook then receives the event and correctly refuses to map the same Stripe customer ID to another user.

This is not a production payment incident today, but it keeps the test webhook retry queue noisy, keeps the Stripe dashboard error rate scary, and can mask future real webhook failures.

All raw Stripe IDs, internal user UUIDs, and emails in this doc are redacted to stable aliases. Use the verification commands below to retrieve live values when implementing.

---

## Implementation Status

PR #311 implemented and merged the code portion of this debt:

- T2: `tests/e2e/helpers/seed-test-user.ts` now requires `E2E_STRIPE_OWNER` when real Stripe credentials are used, stamps `e2e_owner` metadata on E2E-created customers/subscriptions, filters customer reuse by owner, filters active subscription reuse by owner, and preserves same-owner `metadata.user_id` repair without mutating other-owner subscriptions.
- T3: `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts` now stamps a typed `STRIPE_ERROR` field marker for explicit `metadata.e2e_owner` mismatch when `STRIPE_WEBHOOK_E2E_OWNER` is configured. `src/adapters/controllers/stripe-webhook-controller.ts` catches only that marker, logs `reason: 'e2e_owner_mismatch'`, returns 200 without claiming the event, and leaves all other Stripe errors fail-closed.
- Reconcile safety: `src/adapters/jobs/reconcile-stripe-subscriptions.ts` receives the same optional owner configuration and records a row failure rather than skipping when a configured owner mismatch is encountered.
- Configuration: `.env.example` documents `E2E_STRIPE_OWNER` and `STRIPE_WEBHOOK_E2E_OWNER`; `.github/workflows/ci.yml` sets CI E2E ownership to `github-ci`; `lib/env.ts` accepts optional `STRIPE_WEBHOOK_E2E_OWNER`; `lib/container/gateways.ts` threads it through constructor injection.

Post-merge ops status as of 2026-05-19:

- `STRIPE_WEBHOOK_E2E_OWNER=vercel-dev-preview` is applied as a branch-scoped Vercel Preview `(dev)` env var, and the dev-preview alias points at redeployed deployment `dpl_GLTDzFV1SPbbfLMvQ5gapiGFkkDn`.
- The test-mode Stripe webhook endpoint `we_1T19r0KItmaHAwgUrGSpxvdZ` now includes `customer.subscription.created`.
- The live Stripe webhook endpoint `we_1SxtpVKItmaHAwgU3SXpQPEB` now includes `customer.subscription.created`.
- `stripe events list --live --delivery-success=false --limit 100` returned zero live undelivered events on 2026-05-19. Test mode still shows historical pre-fix undelivered events, newest observed `created_iso` 2026-05-16T16:46:46Z, with no post-fix accumulation.

---

## Current Empirical Snapshot

Captured 2026-05-15 from the Stripe CLI authenticated to the project Stripe account.

### Stripe auth

```bash
stripe whoami
```

Observed:

```text
Account: John Jung (acct_REDACTED)
Test mode key: available
Live mode key: available
```

### Webhook endpoint inventory

Test mode:

```bash
stripe webhook_endpoints list --limit 10 \
  | jq '{count:(.data|length), endpoints:[.data[] | {id,status,url,livemode,api_version,enabled_events}]}'
```

Observed:

```text
count: 1
livemode: false
url: https://naltrexone-university-git-dev-john-h-jungs-projects.vercel.app/api/stripe/webhook
enabled_events:
  - checkout.session.completed
  - customer.subscription.updated
  - customer.subscription.deleted
  - invoice.payment_succeeded
  - invoice.payment_failed
```

Live mode:

```bash
stripe webhook_endpoints list --live --limit 10 \
  | jq '{count:(.data|length), endpoints:[.data[] | {id,status,url,livemode,api_version,enabled_events}]}'
```

Observed:

```text
count: 1
livemode: true
url: https://addictionboards.com/api/stripe/webhook
api_version: 2026-01-28.clover
enabled_events: same five events as test mode
```

At this 2026-05-15 snapshot, both endpoints omitted `customer.subscription.created`. That was a real config gap, but it was not the cause of the HTTP 500s described here. Post-merge ops later closed the gap: test mode was updated on 2026-05-18, and live mode was updated on 2026-05-19.

### Undelivered events

Test mode:

```bash
stripe events list --delivery-success=false --limit 100 \
  | jq '{undelivered_count:(.data|length), events:[.data[] | {id,type,created:(.created|todate), pending_webhooks, subscription_id:(.data.object.id // .data.object.subscription // .data.object.parent.subscription_details.subscription // null), status:(.data.object.status // null), has_metadata_user_id:((.data.object.metadata.user_id // null) != null), customer:(.data.object.customer // null)}]}'
```

Observed snapshot:

```text
undelivered_count: 13
11 events: customer.subscription.updated for sub_E2E_ACTIVE_SHARED_REDACTED
  - created between 2026-05-14T07:59:38Z and 2026-05-15T16:08:44Z
  - pending_webhooks: 1
  - status: active
  - has_metadata_user_id: true
2 older events: customer.subscription.updated/deleted for sub_E2E_OLD_MISSING_METADATA_REDACTED
  - created 2026-05-10 and 2026-05-11
  - has_metadata_user_id: false
```

Live mode:

```bash
stripe events list --live --delivery-success=false --limit 100
```

Observed:

```text
0 undelivered live events
```

### Vercel log proof of the new failure mode

Command:

```bash
vercel logs --environment preview --branch dev --since 24h \
  --status-code 500 --json --limit 100 --no-follow \
  | jq -c 'select((.requestPath // .path // .url // "") | contains("/api/stripe/webhook")) | {timestamp:(.timestamp // .time // .date), requestPath:(.requestPath // .path // .url), message:(.message // .text // .error // null)}'
```

Observed for recent `customer.subscription.updated` retries:

```text
ApplicationError: Stripe customer id is already mapped to a different user
code: CONFLICT
event: evt_E2E_REBIND_RETRY_REDACTED
route: /api/stripe/webhook
```

The same log entries also show a secondary `25P02` transaction-aborted error while attempting to `markFailed` after the conflict. That is cleanup noise after the primary conflict, not the root cause.

---

## Confirmed Code Path

### 1. E2E global setup always seeds billing state

`tests/e2e/global.setup.ts:7-12` runs:

```typescript
await runE2ECredentialHealthCheck();
await seedTestSubscription();
await runE2EUserStateReset();
await clerkSetup();
```

CI runs E2E with a local Postgres service and real Stripe/Clerk secrets when available:

- `.github/workflows/ci.yml:35-61` sets `DATABASE_URL` to local CI Postgres and wires Stripe/Clerk secrets.
- `.github/workflows/ci.yml:185-187` runs `pnpm test:e2e`.

### 2. Each independent DB can create a different user UUID for the same E2E email

`db/schema.ts:108-125` defines `users.id` as `uuid('id').defaultRandom().primaryKey()` with unique email and Clerk user indexes.

`tests/e2e/helpers/seed-test-user.ts:88-102` inserts by email and returns the DB-local `users.id`:

```typescript
INSERT INTO users (clerk_user_id, email)
VALUES (${clerkUserId}, ${email})
ON CONFLICT (email) DO UPDATE
  SET clerk_user_id = EXCLUDED.clerk_user_id,
      updated_at    = now()
RETURNING id
```

Consequence: the same Clerk user/email can have different `users.id` values in local CI Postgres, a developer `.env.local` database, and the Vercel preview database.

### 3. The E2E helper reuses a Stripe customer by email across those independent DBs

`tests/e2e/helpers/seed-test-user.ts:113-145`:

- Checks the current DB for `stripe_customers` by `user_id`.
- If absent, calls `stripe.customers.list({ email, limit: 1 })`.
- Reuses the first Stripe customer found for that email.
- Inserts that Stripe customer ID into the current DB for the current DB-local `userId`.

This is safe only if one Stripe account/customer is coupled to exactly one database. It is not safe when local, CI, and Vercel preview all share the same Stripe test account and E2E email.

### 4. The E2E helper reuses and rewrites the active subscription

`tests/e2e/helpers/seed-test-user.ts:185-209` lists subscriptions for the reused Stripe customer. If an active subscription exists, it reuses it and patches metadata when the current DB-local `userId` differs:

```typescript
if (activeSub) {
  if (activeSub.metadata?.user_id !== userId) {
    await stripe.subscriptions.update(activeSub.id, {
      metadata: {
        ...(activeSub.metadata ?? {}),
        user_id: userId,
      },
    });
  }
  subscriptionId = activeSub.id;
}
```

That `stripe.subscriptions.update(...)` call emits a `customer.subscription.updated` event. Since the project has a single test-mode endpoint, Stripe sends that event to the dev-preview webhook URL even when the update came from CI or local E2E setup.

`tests/e2e/helpers/seed-test-user.ts:215-221` correctly writes `metadata.user_id` when creating a new subscription, so this is not DEBT-384's missing-metadata defect anymore. The defect is cross-environment ownership of the same Stripe customer/subscription.

### 5. The webhook controller tries to map the Stripe customer to the event's user ID

`src/adapters/controllers/stripe-webhook-controller.ts:60-84` now catches only the missing-`metadata.user_id` case from DEBT-384.

For events that normalize successfully, `src/adapters/controllers/stripe-webhook-controller.ts:86-139` enters the transaction. At `:110-125`, it writes:

```typescript
await stripeCustomers.insert(
  event.subscriptionUpdate.userId,
  event.subscriptionUpdate.externalCustomerId,
  { conflictStrategy: 'authoritative' },
);

await subscriptions.upsert({ ... });
```

### 6. The repository correctly refuses cross-user Stripe customer remapping

`db/schema.ts:128-146` makes `stripe_customers.user_id` unique and `stripe_customers.stripe_customer_id` unique.

`src/adapters/repositories/drizzle-stripe-customer-repository.ts:25-82` catches a unique violation on `stripeCustomerId` and throws:

```typescript
new ApplicationError(
  'CONFLICT',
  'Stripe customer id is already mapped to a different user',
)
```

This is the exact error seen in Vercel logs.

Important: this repository behavior is correct. Do not "fix" this by allowing one Stripe customer ID to map to multiple users. The bug is upstream test-resource ownership drift.

---

## Root Cause Chain

1. CI/local/dev-preview E2E environments share the same Stripe test account.
2. The E2E helper uses the same Clerk/E2E email in those environments.
3. Each independent DB can create a different `users.id` for that same email.
4. The E2E helper searches Stripe customers by email and reuses the first matching Stripe customer.
5. The helper reuses the active subscription on that shared customer.
6. If the subscription metadata belongs to a different DB-local user ID, the helper rewrites `subscription.metadata.user_id`.
7. Stripe emits `customer.subscription.updated`.
8. The single test webhook endpoint sends that event to the dev-preview app.
9. The dev-preview database already maps the shared Stripe customer ID to its own user row.
10. The webhook tries to insert the same Stripe customer ID for the event's different user ID.
11. The unique constraint/repository conflict triggers HTTP 500.
12. Stripe retries, so the dashboard keeps showing undelivered events.

---

## Why This Is Debt

This is concrete user/developer harm, not speculative cleanup:

- The Stripe dashboard still shows failed webhook deliveries after DEBT-384, so operators cannot trust that the dashboard is clean.
- The retry queue contains real 500s, not only stale historical failures.
- The failure can recur every time E2E setup runs from a different DB against the shared Stripe test account.
- The issue masks unrelated webhook failures because dashboard error-rate noise is no longer actionable.
- The current E2E helper mutates global Stripe test-mode state from local and CI environments, which violates test isolation.

Live mode currently has zero undelivered events, so this is not an active production billing outage. It is still a Stripe integration reliability problem because the same webhook and repository invariants are intentionally shared between test and production.

---

## What This Is Not

- **Not DEBT-384's missing metadata bug.** The 11 newer undelivered events have `metadata.user_id`.
- **Not DEBT-385's invoice schema drift.** DEBT-385 is a 200/no-op invoice path. This debt is a 500/retry subscription-event path.
- **Not caused by the missing `customer.subscription.created` endpoint subscription.** That config gap remains, but the failing events are `customer.subscription.updated`, which the endpoint already receives.
- **Not a sign that the Stripe customer unique constraint is wrong.** One Stripe customer mapping to multiple app users would be dangerous in production.
- **Not evidence of live webhook failures today.** Live `--delivery-success=false` returned zero events in the 2026-05-15 snapshot.

---

## Proposed Fix Direction

Do not implement a broad webhook skip for `CONFLICT`. That would make the dashboard quiet while hiding a serious data-integrity violation.

The durable fix should make E2E Stripe resources environment-owned, then make the webhook skip only test/E2E events that explicitly belong to a different owner.

### Preferred shape

1. Introduce an explicit E2E Stripe ownership namespace for any process that writes test-mode Stripe resources.
   - Candidate env var: `E2E_STRIPE_OWNER`.
   - Examples: `github-ci`, `local-ray`, `vercel-dev-preview`.
   - Do not derive this from raw `DATABASE_URL`; database URLs contain secrets and unstable host details.

2. Stamp that owner into Stripe test objects created by E2E setup.
   - Customer metadata: `{ user_id, clerk_user_id, e2e_owner }`
   - Subscription metadata: `{ user_id, e2e_owner }`

3. Stop selecting arbitrary customers by email.
   - Replace "first customer with this email" with "customer with this email and matching `metadata.e2e_owner`".
   - If none exists, create a new owner-scoped customer.
   - If Stripe customer listing by email is used, list enough candidates and filter in code. Do not assume `limit: 1` returns the owner-correct customer.

4. Stop rewriting active subscriptions that belong to another owner.
   - Reuse/repair only active subscriptions whose customer/subscription metadata owner matches the current `E2E_STRIPE_OWNER`.
   - If an active subscription exists for the same email but different owner, leave it alone and create or reuse an owner-correct subscription.

5. Add a test-mode webhook skip for explicit non-owner E2E events.
   - If a subscription event has `metadata.e2e_owner` and it does not match the webhook deployment's accepted owner, log a structured warning and return 200 without claiming `stripe_events`.
   - Candidate env var: `STRIPE_WEBHOOK_E2E_OWNER`.
   - This skip must be disabled for live mode or any event without the explicit E2E owner marker.
   - Real app/user events with no `e2e_owner` should continue through the existing path.

6. Keep the current fail-closed behavior for real customer conflicts.
   - If no E2E owner mismatch is present, `Stripe customer id is already mapped to a different user` should still propagate as a 500.
   - That protects production from silently accepting corrupted customer ownership.

### Alternative worth evaluating before implementation

Split general authenticated E2E setup from Stripe integration setup:

- General practice/navigation E2E tests seed only local DB rows and do not create/update real Stripe subscriptions.
- Dedicated billing E2E tests use Stripe test mode intentionally, preferably against a local `stripe listen --forward-to localhost:3000/api/stripe/webhook` target or an owner-scoped webhook environment.

This may be cleaner long term, but it is a larger test-infrastructure change. The preferred owner-scope fix above is narrower and addresses the currently confirmed retry source.

---

## Rejected Fixes

- **Do not globally catch `CONFLICT` in `processStripeWebhook` and return 200.** That would hide real production user/customer corruption.
- **Do not remove the unique index on `stripe_customers.stripe_customer_id`.** The unique mapping is the correct domain invariant.
- **Do not keep using `stripe.customers.list({ email, limit: 1 })` as the ownership selector.** It is non-deterministic once more than one test customer shares the E2E email.
- **Do not delete the active test subscription as the only fix.** Cleanup may quiet today's queue, but the next E2E run can recreate the same pattern.
- **Do not conflate this with DEBT-385.** Invoice schema drift must be fixed separately.

---

## Implementation Plan

Follow TDD. No implementation should begin until the owner model is explicitly chosen.

### Phase 1 - Lock the current failure with tests

Target: `tests/e2e/helpers/seed-test-user.test.ts`

Add tests that demonstrate current unsafe behavior before changing production code:

- `it('does not reuse a Stripe customer from a different E2E owner')`
- `it('does not update an active subscription owned by another E2E owner')`
- `it('creates or reuses only owner-scoped E2E subscriptions')`

The existing test file already exercises `seedTestSubscription`; extend it with fake Stripe surfaces instead of reaching live Stripe. Keep the repo's fake-over-mock discipline. If the current test harness cannot express ownership cleanly, improve the local fake surface first.

### Phase 2 - Add explicit owner metadata in the E2E helper

Target: `tests/e2e/helpers/seed-test-user.ts`

Expected changes:

- Require or derive a safe default for `E2E_STRIPE_OWNER` in E2E setup.
- Add owner metadata to E2E-created customers and subscriptions.
- Filter candidate Stripe customers by owner.
- Filter candidate active subscriptions by owner.
- Refuse to mutate metadata on a subscription owned by another environment.

Open design choice: whether `E2E_STRIPE_OWNER` should be mandatory when real Stripe credentials are present. Mandatory is safer because silent defaults can recreate cross-agent drift.

### Phase 3 - Add webhook owner-mismatch skip

Likely targets:

- `src/adapters/gateways/stripe/stripe-webhook-processor.ts`
- `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts`
- `src/adapters/controllers/stripe-webhook-controller.ts`
- `src/adapters/controllers/stripe-webhook-controller.test.ts`
- possibly `lib/env.ts` and `lib/container/gateways.ts` if a new owner env var must be injected

Expected tests:

- `processStripeWebhook` returns cleanly for a subscription event explicitly marked as E2E-owned by another owner.
- It logs a structured warning, for example `reason: 'e2e_owner_mismatch'`.
- It does not claim or mark `stripe_events`.
- It does not upsert `stripe_customers` or `stripe_subscriptions`.
- It still propagates the same `CONFLICT` when the event has no E2E owner marker.
- It still propagates the same `CONFLICT` when live mode is true.
- DEBT-384's missing-metadata skip still works.

### Phase 4 - Operational cleanup after code lands

After the code fix is deployed:

1. Re-run:

   ```bash
   stripe events list --delivery-success=false --limit 100
   ```

2. Existing historical failed attempts should age out or succeed on retry if still pending.

3. Consider deleting stale test-mode E2E customers/subscriptions only after the new owner model exists. Cleanup without the code fix is temporary.

4. Confirm endpoint event-list parity. As of 2026-05-19, both test-mode and live webhook endpoints include `customer.subscription.created`. This config step was separate from the root cause of this debt and is now complete.

---

## Acceptance Criteria

- E2E setup no longer rewrites subscription metadata for a Stripe subscription owned by a different E2E environment.
- E2E setup no longer reuses the first Stripe customer found by email unless that customer is owner-correct.
- A real Stripe test event emitted by CI/local E2E cannot cause the dev-preview webhook to map the shared Stripe customer to the wrong DB-local user.
- The webhook returns HTTP 200 for explicit E2E owner-mismatch events in test/preview contexts and logs the skip.
- The webhook still fails closed for real ownership conflicts without an E2E owner mismatch marker.
- `stripe events list --delivery-success=false --limit 100` stops accumulating new `customer.subscription.updated` failures for the E2E active subscription.
- Live mode remains unaffected.
- DEBT-385 remains open and untouched unless implemented in a separate pass.

---

## Verification Commands For The Implementation Agent

Before coding:

```bash
git status --short --branch
stripe whoami
stripe events list --delivery-success=false --limit 100
stripe events list --live --delivery-success=false --limit 100
vercel logs --environment preview --branch dev --since 24h --status-code 500 --json --limit 100 --no-follow
```

After coding and deployment:

```bash
stripe events list --delivery-success=false --limit 100
vercel logs --environment preview --branch dev --since 24h --query "Stripe webhook failed" --json --limit 100 --no-follow
```

Expected after a correct fix:

- No newly-created undelivered `customer.subscription.updated` events caused by E2E owner drift.
- No new Vercel log entries with `Stripe customer id is already mapped to a different user` from E2E subscription updates.
- If old pending events retry, owner-mismatch E2E events should be 200-skipped rather than 500-retried.

---

## Decisions Applied During Implementation

1. Deployed dev-preview webhook owner: `STRIPE_WEBHOOK_E2E_OWNER=vercel-dev-preview`.
2. CI E2E owner: `E2E_STRIPE_OWNER=github-ci`.
3. Local developer owner default: `local-dev` only when Stripe credentials are dummy; real Stripe credentials require an explicit `E2E_STRIPE_OWNER`.
4. `customer.subscription.created` endpoint config remained out of scope for code. Test-mode endpoint config was completed on 2026-05-18, and live endpoint config was completed on 2026-05-19 via Stripe Dashboard/operator action.

---

## Out Of Scope

- Implementing DEBT-385 invoice schema drift.
- Changing the production Stripe customer uniqueness invariant.
- Deleting Stripe resources during implementation.
- Broadly suppressing webhook 500s.
- Scheduling or changing reconciliation cron behavior.
- Marketing/landing page work from DEBT-382.
