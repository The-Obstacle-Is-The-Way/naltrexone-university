# DEBT-310: Production Neon `main` Contains Non-Production Stripe Subscription Rows

**Priority:** P1
**Created:** 2026-03-13
**Status:** Resolved
**Resolved:** 2026-03-13
**Related:** [DEBT-240](./debt-240-local-dev-database-url-points-to-production.md), [DEBT-239](./debt-239-env-local-stripe-account-mismatch.md), [BS-029](../brainstorming/bs-029-clerk-user-id-email-upsert-conflict.md), [BUG-079](../bugs/bug-079-preview-dev-environment-verification-failures.md)

---

## Sentry Alert (Production)

**ID:** `99a9219925464810ae62eb5008fe647b`
**Timestamp:** 2026-03-13 16:40:41 UTC
**Environment:** production
**URL:** `https://addictionboards.com/app/dashboard` (GET)
**Release:** `90c85473babf7cd51a769bf1a521a1f9080ed8a5`

```
ApplicationError: Unknown Stripe price id "price_1SwOiNKAPxQwR68AemPhbAqG"
  for subscription 997af97e-7cac-49f6-9c6e-8b5fef498466
  at Q.toDomain (lib_container_ts_4949882c._.js:5)
  at Q.findByUserId (lib_container_ts_4949882c._.js:5)
  at U.execute (lib_container_ts_4949882c._.js:5)
```

**User impact:** The affected user's `/app/dashboard` request crashes when the subscription read path loads an invalid `stripe_subscriptions` row from the production database.

---

## Executive Summary

The earlier "old Stripe account orphaned webhook row" explanation is **not accurate**.

What the investigation actually verified:

1. **Current production configuration is correct.**
   Vercel Production is currently using:
   - Neon `main` (`ep-withered-cell-ah14ik13-pooler`)
   - live Stripe secret key
   - live price IDs `price_1SxttBKItmaHAwgUOYmmLy8o` / `price_1SxtuSKItmaHAwgUYUAl4Kxd`

2. **Production `main` is polluted with non-production subscription rows.**
   At investigation time, `stripe_subscriptions` in Neon `main` contained exactly **two** rows:
   - one row for `jj@novamindnyc.com` with the old-account price ID from the Sentry error
   - one row for `e2e-test@addictionboards.com` with the current **test-mode** monthly price ID

3. **There are zero live-price subscription rows in production `main`.**
   This means the problem is broader than one stale row: the subscription mirror in production currently contains only non-production data.

4. **The affected row is not a real Stripe subscription synced by webhook.**
   Its `stripe_subscription_id` is `sub_dev_local_seed`, which does **not** exist in either the current live account or the current test account. That makes the row a local/manual seed artifact, not a real Stripe subscription object.

5. **The true root cause is historical environment isolation failure.**
   Before [DEBT-240](./debt-240-local-dev-database-url-points-to-production.md) was fixed on 2026-02-22, local `.env.local` pointed at Neon `main`. Local debugging / seeding writes therefore landed in the production database.

---

## Verified Environment Matrix

### Current production runtime

Verified on 2026-03-13 via `vercel env pull` for the real Vercel project `john-h-jungs-projects/naltrexone-university`:

| Surface | Verified value | Meaning |
|---------|----------------|---------|
| `NEXT_PUBLIC_APP_URL` | `https://addictionboards.com` | Real production app |
| `DATABASE_URL` host | `ep-withered-cell-ah14ik13-pooler...` | Neon `main` |
| `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY` | `price_1SxttBKItmaHAwgUOYmmLy8o` | live monthly |
| `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL` | `price_1SxtuSKItmaHAwgUYUAl4Kxd` | live annual |
| Stripe API lookup | both prices retrieved with `livemode: true` | production env is live-mode Stripe |

### Current local development runtime

Verified from local `.env.local`:

| Surface | Verified value | Meaning |
|---------|----------------|---------|
| `DATABASE_URL` host | `ep-still-frog-ahx7bp6y-pooler...` | Neon `dev` |
| `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY` | `price_1SxuYAKItmaHAwgUWaePv0AC` | test monthly |
| `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL` | `price_1SxuYXKItmaHAwgUjobv4lxY` | test annual |
| Stripe API lookup | both prices retrieved with `livemode: false` | local env is test-mode Stripe |

### Historical exception that explains the contamination

[DEBT-240](./debt-240-local-dev-database-url-points-to-production.md) documented that **before 2026-02-22**, local `.env.local` pointed at the production Neon `main` branch instead of the dev branch. That made local/dev/E2E writes hit production data.

---

## Production Data Actually Present

Query executed against Neon `main` on 2026-03-13:

```sql
SELECT
  ss.id,
  u.email,
  sc.stripe_customer_id,
  ss.stripe_subscription_id,
  ss.price_id,
  ss.created_at
FROM stripe_subscriptions ss
JOIN users u ON u.id = ss.user_id
LEFT JOIN stripe_customers sc ON sc.user_id = ss.user_id
ORDER BY ss.created_at;
```

Returned rows:

| Row ID | Email | Stripe Customer ID | Stripe Subscription ID | Price ID | Created At | Interpretation |
|--------|-------|--------------------|------------------------|----------|------------|----------------|
| `997af97e-7cac-49f6-9c6e-8b5fef498466` | `jj@novamindnyc.com` | `cus_TvoBcSUN9ZpK3A` | `sub_dev_local_seed` | `price_1SwOiNKAPxQwR68AemPhbAqG` | 2026-02-21 19:20:29 UTC | local/manual polluted row; this is the Sentry crash row |
| `84d3fbf7-5344-4ac4-ab1b-74e0e1225f48` | `e2e-test@addictionboards.com` | `cus_TxDC4CL6IjuC3f` | `sub_1SzJcRKItmaHAwgUvAMv6MLb` | `price_1SxuYAKItmaHAwgUWaePv0AC` | 2026-02-22 15:02:40 UTC | real Stripe **test-mode** subscription leaked into production `main` |

Additional verification:

- `SELECT count(*) FROM stripe_subscriptions WHERE price_id IN ('price_1SxttBKItmaHAwgUOYmmLy8o', 'price_1SxtuSKItmaHAwgUYUAl4Kxd');`
  - result: `0`
- `SELECT count(*) FROM stripe_subscriptions WHERE price_id NOT IN ('price_1SxttBKItmaHAwgUOYmmLy8o', 'price_1SxtuSKItmaHAwgUYUAl4Kxd');`
  - result: `2`

So the production database currently has **zero live subscription rows** and **two non-production rows**.

---

## Why The Earlier Root Cause Was Wrong

### Claim: "The affected row came from an old-account webhook"

This is **not supported** by the data.

What we verified instead:

- The stored `price_id` does come from the old Stripe account documented in [DEBT-239](./debt-239-env-local-stripe-account-mismatch.md).
- But the stored `stripe_subscription_id` is `sub_dev_local_seed`.
- `sub_dev_local_seed` does **not** exist in the current live account.
- `sub_dev_local_seed` does **not** exist in the current test account.

That means the row is **not** a real Stripe subscription object that was mirrored by the webhook pipeline.

### Claim: "The entire row belongs to the dead Stripe account"

This is also too strong.

What we verified:

- The related `stripe_customers` row for `jj@novamindnyc.com` points to `cus_TvoBcSUN9ZpK3A`.
- That customer **does exist** in the current **live** Stripe account.
- That live customer currently has **zero** subscriptions.

So the accurate statement is:

- the row stores an **old-account price ID**
- the row stores a **fake/non-Stripe subscription ID**
- the customer mapping points to the **current live account**

This is a mixed, polluted record, not a clean "old account orphan."

### Claim: "Test price IDs should be treated as valid in production cleanup"

This is incorrect for this incident.

Production runtime only recognizes the live production price pair. A test-mode price row in Neon `main` is also invalid production data and should be cleaned up there.

---

## Actual Root Cause

The production crash is caused by **non-production subscription data written into Neon `main` before environment isolation was fixed**.

### Sequence

1. **Before 2026-02-22**, local `.env.local` pointed to Neon `main`, not Neon `dev`.
   This is the issue resolved by [DEBT-240](./debt-240-local-dev-database-url-points-to-production.md).

2. **Before 2026-02-22**, local `.env.local` also contained Stripe price IDs from the old account.
   This is the issue resolved by [DEBT-239](./debt-239-env-local-stripe-account-mismatch.md).

3. **On 2026-02-21**, local debugging around [BS-029](../brainstorming/bs-029-clerk-user-id-email-upsert-conflict.md) updated `jj@novamindnyc.com` data while local development was still pointed at Neon `main`.
   The row shape strongly indicates a manual/local seed:
   - fake `stripe_subscription_id` = `sub_dev_local_seed`
   - non-live price ID from the stale local Stripe env
   - no matching Stripe subscription in live or test mode

4. **On 2026-02-22**, the E2E seed helper in [tests/e2e/helpers/seed-test-user.ts](../../tests/e2e/helpers/seed-test-user.ts) wrote a real Stripe **test-mode** subscription into the database using `DATABASE_URL` plus `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`.
   Because `.env.local` had not yet been corrected to Neon `dev`, that write landed in Neon `main`.

5. **On 2026-03-13**, the affected user hit `/app/dashboard`.
   Production runtime loaded the polluted row and compared its stored `price_id` against the live production price IDs.

### Read path (correct behavior)

The crash path is the expected application behavior for invalid production data:

```text
GET /app/dashboard
  -> GetSubscriptionByUser.execute(userId)
    -> DrizzleSubscriptionRepository.findByUserId(userId)
      -> toDomain(row)
        -> getSubscriptionPlanFromPriceId(row.priceId, liveProductionPriceIds)
          -> returns null for old/test price ids
        -> throws ApplicationError('INTERNAL_ERROR', 'Unknown Stripe price id ...')
```

Relevant code:

- `src/adapters/repositories/drizzle-subscription-repository.ts`
- `src/adapters/config/stripe-prices.ts`

The code is correctly surfacing invalid production data. The incident is a data-integrity problem, not a read-path bug.

---

## Stripe Verification Details

### Affected user (`jj@novamindnyc.com`)

Verified against the current **live** Stripe account:

- customer `cus_TvoBcSUN9ZpK3A` exists
- email matches `jj@novamindnyc.com`
- `subscriptions.list({ customer: 'cus_TvoBcSUN9ZpK3A', status: 'all' })` returns **0** subscriptions
- `subscriptions.retrieve('sub_dev_local_seed')` returns `resource_missing`

### E2E user (`e2e-test@addictionboards.com`)

Verified against the current **test** Stripe account:

- `subscriptions.retrieve('sub_1SzJcRKItmaHAwgUvAMv6MLb')` succeeds
- returned `priceId = 'price_1SxuYAKItmaHAwgUWaePv0AC'`
- returned `livemode = false`

This confirms the second row is real test-mode Stripe data stored in the production database.

---

## Resolution

### Production cleanup executed

The invalid subscription rows were deleted from Neon `main` on 2026-03-13.

Deleted row IDs:

```sql
DELETE FROM stripe_subscriptions
WHERE id IN (
  '997af97e-7cac-49f6-9c6e-8b5fef498466',
  '84d3fbf7-5344-4ac4-ab1b-74e0e1225f48'
);
```

The diagnostic query used before deletion was:

```sql
SELECT
  ss.id,
  u.email,
  sc.stripe_customer_id,
  ss.stripe_subscription_id,
  ss.price_id,
  ss.status,
  ss.created_at
FROM stripe_subscriptions ss
JOIN users u ON u.id = ss.user_id
LEFT JOIN stripe_customers sc ON sc.user_id = ss.user_id
WHERE ss.price_id NOT IN (
  'price_1SxttBKItmaHAwgUOYmmLy8o',
  'price_1SxtuSKItmaHAwgUYUAl4Kxd'
)
ORDER BY ss.created_at;
```

As of the incident window, that query returned the two polluted rows listed above.

### Optional follow-up cleanup

After deleting the polluted subscription rows:

- consider deleting the `stripe_customers` row for `e2e-test@addictionboards.com` from Neon `main`, because it is also non-production billing data
- keep the `stripe_customers` row for `jj@novamindnyc.com` unless business logic says otherwise; it is a real live customer mapping, even though that customer currently has zero subscriptions

### Post-fix verification

```sql
SELECT count(*)
FROM stripe_subscriptions;

SELECT count(*)
FROM stripe_subscriptions
WHERE price_id NOT IN (
  'price_1SxttBKItmaHAwgUOYmmLy8o',
  'price_1SxtuSKItmaHAwgUYUAl4Kxd'
);
```

Verified results after cleanup:

- `stripe_subscriptions` total rows in production `main`: `0`
- invalid non-live-price rows in production `main`: `0`
- `jj@novamindnyc.com` subscription rows in production `main`: `0`

Development Neon `dev` was also checked after the production fix:

- four subscription rows remain
- all four use the current test-mode price IDs
- no cleanup was needed on `dev`

Then:

- verify `/app/dashboard` loads for `jj@novamindnyc.com`
- monitor Sentry for recurrence of `Unknown Stripe price id`

---

## Scope

### Production code changes

None required for the immediate incident.

### Why no code change

- The repository correctly rejects non-production `price_id` values in production reads.
- The real bug was historical data pollution from local/dev workflows writing into production `main`.
- [DEBT-240](./debt-240-local-dev-database-url-points-to-production.md) already fixed the local `DATABASE_URL` isolation issue.

### Tests

None required for the immediate incident.

---

## Verification Checklist

- [x] Pulled and verified current Vercel Production env
- [x] Verified current local `.env.local` points to Neon `dev`
- [x] Queried Neon `main` and captured all `stripe_subscriptions` rows
- [x] Verified there are zero live-price rows in Neon `main`
- [x] Verified `sub_dev_local_seed` is not a real Stripe subscription
- [x] Verified `jj@novamindnyc.com` live customer exists and has zero subscriptions
- [x] Verified `e2e-test@addictionboards.com` row is a real Stripe test subscription
- [x] Deleted polluted rows from Neon `main`
- [x] Re-ran production verification queries
- [x] Confirmed the crash-causing subscription row no longer exists
