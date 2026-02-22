# DEBT-240: Local Dev DATABASE_URL Points to Production Neon Branch

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-22
**Resolved:** 2026-02-22

---

## Description

The local `.env.local` file set `DATABASE_URL` to the **production** Neon Postgres endpoint (`ep-withered-cell-ah14ik13-pooler`) instead of the **development** branch endpoint (`ep-still-frog-ahx7bp6y-pooler`).

This contradicted the project's own documentation in `docs/dev/deployment-environments.md`, which specifies that local development should use the dev branch.

### Root Cause

The Neon `dev` branch was created on 2026-02-06. Before that date, there was only one branch (production). When `.env.local` was originally created, it pointed to the only existing branch — `main` (production). When the dev branch was created and Vercel env vars were properly scoped, `.env.local` was never updated because it's gitignored and manually maintained.

### State Before Fix

| Environment | Neon Endpoint | Branch |
|-------------|---------------|--------|
| `.env.local` (local dev) | `ep-withered-cell-ah14ik13-pooler` | **main (PRODUCTION)** |
| Vercel Development | `ep-still-frog-ahx7bp6y-pooler` | dev |
| Vercel Preview | `ep-still-frog-ahx7bp6y-pooler` | dev |
| Vercel Production | `ep-withered-cell-ah14ik13-pooler` | main |

### State After Fix

| Environment | Neon Endpoint | Branch |
|-------------|---------------|--------|
| `.env.local` (local dev) | `ep-still-frog-ahx7bp6y-pooler` | **dev** |
| Vercel Development | `ep-still-frog-ahx7bp6y-pooler` | dev |
| Vercel Preview | `ep-still-frog-ahx7bp6y-pooler` | dev |
| Vercel Production | `ep-withered-cell-ah14ik13-pooler` | main |

## Impact (Before Fix)

- **Data safety risk:** Local development reads and writes directly to the production database. Any seed scripts, test data, or accidental mutations affect real production data.
- **Schema drift risk:** Running `drizzle-kit push` or migrations locally would apply schema changes to the production database.
- **Test pollution:** E2E tests and integration tests running locally create records in the production database.

## Resolution

1. Updated `.env.local` `DATABASE_URL` from `ep-withered-cell-ah14ik13-pooler` to `ep-still-frog-ahx7bp6y-pooler`
2. Verified credentials are identical across both branches (same `neondb_owner` user and password)
3. Confirmed `pnpm dev` starts without database errors on port 3000
4. Confirmed homepage (200), pricing page (200), and API endpoints respond correctly
5. DNS resolution of `ep-still-frog-ahx7bp6y-pooler.c-3.us-east-1.aws.neon.tech` verified

## Verification

- [x] `pnpm dev` starts without database errors
- [x] Pages load correctly (/, /pricing return 200)
- [x] `docs/dev/deployment-environments.md` now matches actual `.env.local` configuration
- [ ] `pnpm test:integration` — not run (uses Docker postgres via `.env.test`, independent of this fix)

## Related

- `docs/dev/deployment-environments.md` — documents expected environment mapping
- `.env.local` (gitignored) — the file that was updated
- `.env.example` — template for new developers
- Discovered during Vercel environment audit (DEBT-239 session)
