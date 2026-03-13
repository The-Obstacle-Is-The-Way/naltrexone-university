# DEBT-310: Stale Stripe Price ID in Production Database — Old Account Subscription Record Breaks Dashboard

**Priority:** P1
**Created:** 2026-03-13
**Status:** Open
**Related:** [DEBT-239](../_archive/debt/debt-239-env-local-stripe-account-mismatch.md), [DEBT-155](../_archive/debt/debt-155-stripe-legacy-duplicate-subscriptions-reconciliation.md), [BUG-079](../_archive/bugs/bug-079-preview-dev-environment-verification-failures.md)

---

## Sentry Alert (Production)

**ID:** `99a9219925464810ae62eb5008fe647b`
**Timestamp:** 2026-03-13 16:40:41 UTC
**Environment:** production
**URL:** `https://addictionboards.com/app/dashboard` (GET)
**Release:** `90c85473babf7cd51a769bf1a521a1f9080ed8a5`
**Runtime:** node v24.13.0, Chrome 145.0.0, macOS

```
ApplicationError: Unknown Stripe price id "price_1SwOiNKAPxQwR68AemPhbAqG"
  for subscription 997af97e-7cac-49f6-9c6e-8b5fef498466
  at Q.toDomain (lib_container_ts_4949882c._.js:5)
  at Q.findByUserId (lib_container_ts_4949882c._.js:5)
  at U.execute (lib_container_ts_4949882c._.js:5)
```

**User impact:** The affected user's `/app/dashboard` page crashes. Any route that reads entitlement status for this user will also crash (`findByUserId` → `toDomain` → `ApplicationError`).

---

## Root Cause

### Three sets of Stripe price IDs exist in project history

| Set | Monthly Price ID | Annual Price ID | Stripe Account |
|-----|-----------------|----------------|----------------|
| **Old account (dead)** | `price_1SwOiNKAPxQwR68AemPhbAqG` | `price_1SwOiZKAPxQwR68AGAZSsJ1X` | `51Svkj6KAPxQwR68A` |
| **Current — LIVE mode** | `price_1SxttBKItmaHAwgUOYmmLy8o` | `price_1SxtuSKItmaHAwgUYUAl4Kxd` | `51SvkizKItmaHAwgU` |
| **Current — TEST mode** | `price_1SxuYAKItmaHAwgUWaePv0AC` | `price_1SxuYXKItmaHAwgUjobv4lxY` | `51SvkizKItmaHAwgU` |

Source: [deployment-environments.md](../dev/deployment-environments.md) lines 86-111 and [DEBT-239](../_archive/debt/debt-239-env-local-stripe-account-mismatch.md) lines 17-22.

### What happened

1. **Before 2026-02-22:** The project was configured with keys from a **different Stripe account** (prefix `KAPxQwR68A`). At some point during this period, a subscription was created via a webhook from the old account. The webhook processor stored the old account's price ID (`price_1SwOiNKAPxQwR68AemPhbAqG`) in the production Neon `main` database's `stripe_subscriptions.price_id` column.

2. **2026-02-22 (DEBT-239 fix):** Environment variables were updated to the current Stripe account (`KItmaHAwgU`). The Vercel production env vars now contain the LIVE mode price IDs. `.env.local` was updated with the TEST mode IDs. The fix was verified for `.env.local` and source code. **The existing database records were not migrated.**

3. **2026-03-13 (this error):** The affected user hits `/app/dashboard`. The `DrizzleSubscriptionRepository.findByUserId()` loads the subscription row, which still has `price_id = 'price_1SwOiNKAPxQwR68AemPhbAqG'`. The `getSubscriptionPlanFromPriceId()` function compares this against the current LIVE price IDs, finds no match, returns `null`, and `toDomain()` throws `ApplicationError('INTERNAL_ERROR', ...)`.

### The subscription record is an orphan

The problem is deeper than just a stale price ID. The entire `stripe_subscriptions` row references a subscription that lives on the **old Stripe account** (`KAPxQwR68A`). This means:

- The `stripe_subscription_id` column references a subscription ID on a Stripe account we no longer control
- The `price_id` column contains a price from that dead account
- The subscription cannot be refreshed, canceled, or reconciled via the current Stripe account's API
- Updating just the `price_id` would mask the orphan — the `stripe_subscription_id` would still point to a ghost

---

## Failure Path (Code Walkthrough)

### Read path (where the error occurs)

```
User visits /app/dashboard (GET)
  └─ Server Component renders
    └─ GetSubscriptionByUser.execute(userId)                    [use case]
      └─ DrizzleSubscriptionRepository.findByUserId(userId)     [adapter]
        └─ db.query.stripeSubscriptions.findFirst(...)          [drizzle query]
          └─ Returns row with price_id = 'price_1SwOiNKAPxQwR68AemPhbAqG'
        └─ toDomain(row)
          └─ getSubscriptionPlanFromPriceId(row.priceId, this.priceIds)
            ├─ priceId  = 'price_1SwOiNKAPxQwR68AemPhbAqG'    (old account)
            ├─ monthly  = 'price_1SxttBKItmaHAwgUOYmmLy8o'    (live, current)
            ├─ annual   = 'price_1SxtuSKItmaHAwgUYUAl4Kxd'    (live, current)
            └─ No match → returns null
          └─ plan is null → throw ApplicationError('INTERNAL_ERROR', ...)
```

**Key files:**
- `src/adapters/config/stripe-prices.ts:15-22` — `getSubscriptionPlanFromPriceId()` returns `null` on mismatch
- `src/adapters/repositories/drizzle-subscription-repository.ts:30-37` — `toDomain()` throws on null plan
- `lib/container.ts:54-57` — price IDs sourced from env vars

### Write path (how the data got there originally)

```
Stripe sends webhook (old account, before 2026-02-22)
  └─ stripe-webhook-processor → normalizeStripeSubscriptionUpdate()
    └─ Extracts priceId from subscription.items.data[0].price.id
    └─ getSubscriptionPlanFromPriceId(priceId, priceIds) → matched (env had old IDs)
  └─ DrizzleSubscriptionRepository.upsert(...)
    └─ INSERT INTO stripe_subscriptions (..., price_id = 'price_1SwOiN...', ...)
```

At the time the webhook was processed, the env vars **also** had the old price IDs, so the mapping succeeded. The mismatch only manifests after the env vars were updated without migrating the data.

### Other affected paths

Any code path that calls `toDomain()` or `normalizeStripeSubscriptionUpdate()` will fail for this user:

| Path | File | Impact |
|------|------|--------|
| Dashboard entitlement check | `drizzle-subscription-repository.ts:51` | **Crashes** — this is the Sentry error |
| Billing page | Same repository | **Crashes** — cannot render subscription status |
| Webhook updates | `stripe-subscription-normalizer.ts:60` | **Won't fire** — old account isn't sending webhooks |
| Reconciliation cron | `reconcile-stripe-subscriptions.ts:88` | **May crash** — if it tries to reconcile this user |
| Checkout success sync | `checkout-success-sync.tsx:225` | **Logs warning** — `unknown_plan` |

---

## Codebase-Wide Verification

### Environment variables are correctly configured

Verified via [deployment-environments.md](../dev/deployment-environments.md) (last verified 2026-02-22):

| Env | Monthly Price ID | Annual Price ID | Account Mode |
|-----|-----------------|----------------|--------------|
| **Vercel Production** | `price_1SxttBKItmaHAwgUOYmmLy8o` | `price_1SxtuSKItmaHAwgUYUAl4Kxd` | `KItmaHAwgU` live |
| **Vercel Preview** | `price_1SxuYAKItmaHAwgUWaePv0AC` | `price_1SxuYXKItmaHAwgUjobv4lxY` | `KItmaHAwgU` test |
| **Vercel Development** | `price_1SxuYAKItmaHAwgUWaePv0AC` | `price_1SxuYXKItmaHAwgUjobv4lxY` | `KItmaHAwgU` test |
| **`.env.local`** | `price_1SxuYAKItmaHAwgUWaePv0AC` | `price_1SxuYXKItmaHAwgUjobv4lxY` | `KItmaHAwgU` test |
| **`.env.test`** | `price_dummy_monthly` | `price_dummy_annual` | N/A (unit tests) |

All env vars point to the **current account** (`KItmaHAwgU`). No old account references (`KAPxQwR68A`) exist in any env file or source code.

### No hardcoded old price IDs in source code

Searched entire codebase for `KAPxQwR68A` and `SwOiN` — zero matches in application code. The old IDs are only referenced in the archived DEBT-239 doc and this debt doc.

### Database schema has no migration-level guard

The `stripe_subscriptions.price_id` column is `varchar(255) NOT NULL` with no CHECK constraint or enum. Any string starting with `price_` is accepted. There is no database-level enforcement that stored price IDs match the application's configured IDs.

### Neon branching is not the cause

- Production uses Neon `main` branch (`ep-withered-cell-ah14ik13-pooler`)
- Preview/Dev uses Neon `dev` branch (`ep-still-frog-ahx7bp6y-pooler`)
- The branches are properly isolated via `DATABASE_URL` scoping in Vercel
- The stale data exists in `main` because it was written when the old Stripe account was active

### Multiple clone repos are not the cause

The error is a data issue in the production Neon `main` database, not a code-level misconfiguration. All clone repos (`naltrexone-university`, `-2`, `-3`, `-4`) deploy from the same GitHub repo to the same Vercel project. They share the same Vercel env vars and the same Neon database. The old data predates the clone structure.

---

## Solution

### Step 1: Identify all affected records (diagnostic query)

Run against the **production Neon `main` branch**:

```sql
-- Find all subscription records whose price_id does NOT match
-- any currently configured price ID (live or test mode).
SELECT
  id,
  user_id,
  stripe_subscription_id,
  price_id,
  status,
  cancel_at_period_end,
  current_period_end,
  created_at,
  updated_at
FROM stripe_subscriptions
WHERE price_id NOT IN (
  -- Current account LIVE mode (Production env vars)
  'price_1SxttBKItmaHAwgUOYmmLy8o',   -- monthly live
  'price_1SxtuSKItmaHAwgUYUAl4Kxd',   -- annual live
  -- Current account TEST mode (Preview/Dev env vars)
  'price_1SxuYAKItmaHAwgUWaePv0AC',   -- monthly test
  'price_1SxuYXKItmaHAwgUjobv4lxY'    -- annual test
);
```

This will return all orphaned records, including the one from the Sentry error (`997af97e-7cac-49f6-9c6e-8b5fef498466`).

### Step 2: Determine user status on the current Stripe account

For each affected `user_id`:

1. **Check if the user has an active subscription on the current Stripe account** — look up the user's Clerk ID, then search the current Stripe account for customers with that metadata.
2. **If yes:** The user has a valid subscription elsewhere. Delete the orphaned row and let the webhook or reconciliation cron re-sync the correct subscription.
3. **If no:** The user's only subscription was on the old dead account. The record is truly orphaned. Delete it. The user will see the paywall and can subscribe fresh on the current account.

### Step 3: Delete orphaned records

```sql
-- After manual verification of each affected user_id (Step 2):
DELETE FROM stripe_subscriptions
WHERE price_id IN (
  'price_1SwOiNKAPxQwR68AemPhbAqG',   -- old account monthly
  'price_1SwOiZKAPxQwR68AGAZSsJ1X'    -- old account annual
);
```

**Why DELETE, not UPDATE:** The entire row is invalid — the `stripe_subscription_id` references a subscription on a dead Stripe account. Updating just the `price_id` would create a record that passes the mapping check but points to a `stripe_subscription_id` that cannot be verified, canceled, or reconciled via the current Stripe API. A clean delete is the correct approach.

### Step 4: Verify the fix

```sql
-- Confirm no orphaned records remain
SELECT count(*)
FROM stripe_subscriptions
WHERE price_id NOT IN (
  'price_1SxttBKItmaHAwgUOYmmLy8o',
  'price_1SxtuSKItmaHAwgUYUAl4Kxd',
  'price_1SxuYAKItmaHAwgUWaePv0AC',
  'price_1SxuYXKItmaHAwgUjobv4lxY'
);
-- Expected: 0
```

Then visit `/app/dashboard` as the affected user (or check Sentry for recurrence).

---

## What This Does NOT Include

1. **No code changes.** The `toDomain()` error behavior is correct — it should throw when encountering an unknown price ID. Adding legacy fallback support would hide data integrity issues and introduce technical debt (tracked price ID sets, silent downgrades, stale mapping logic). This is a Greenfield project with a single-digit user count. Clean data, not defensive code, is the right fix.

2. **No database CHECK constraint.** While a `CHECK (price_id IN (...))` would prevent future mismatches at the DB level, it would also break deployments when price IDs change (e.g., if Stripe products are recreated). The application-level validation in `toDomain()` is sufficient and more maintainable. A future ADR can revisit this if the risk profile changes.

3. **No reconciliation cron changes.** The reconciliation job (`reconcile-stripe-subscriptions.ts`) already uses `getSubscriptionPlanFromPriceId()` for validation. Once the orphaned records are deleted, it will work correctly for all remaining records.

---

## Scope

### Operations (manual)

| Step | Action | Environment |
|------|--------|-------------|
| 1 | Run diagnostic query | Neon `main` (production) via Neon Console or `psql` |
| 2 | Check affected users against current Stripe account | Stripe Dashboard (live mode) |
| 3 | Delete orphaned records | Neon `main` (production) |
| 4 | Verify fix | Neon `main` + Sentry |

### Production code changes

None.

### Tests

None.

---

## Verification

- [ ] Diagnostic query executed — affected records identified and documented
- [ ] Each affected user's status on current Stripe account verified
- [ ] Orphaned records deleted from production Neon `main`
- [ ] Post-deletion query confirms zero orphaned records
- [ ] `/app/dashboard` loads successfully for affected user(s)
- [ ] Sentry error `99a9219925464810ae62eb5008fe647b` does not recur within 24 hours
- [ ] Reconciliation cron (`/api/cron/reconcile-stripe-subscriptions`) runs without errors

---

## Prevention

This class of issue (stale data from a previous vendor account) is inherently a one-time migration artifact. It cannot recur because:

1. The old Stripe account (`KAPxQwR68A`) is no longer configured anywhere
2. No webhooks from the old account can reach our endpoints
3. The `normalizeStripeSubscriptionUpdate()` function validates price IDs on every incoming webhook — a webhook with an unknown price ID is rejected with `STRIPE_ERROR` before reaching the database
4. The env validation in `lib/env.ts` ensures price IDs are always set and formatted correctly

The only outstanding prevention gap is that `toDomain()` crashes instead of gracefully handling stale data. This is the **correct** behavior for a Greenfield project — it surfaces data integrity issues immediately rather than silently serving incorrect entitlement status.
