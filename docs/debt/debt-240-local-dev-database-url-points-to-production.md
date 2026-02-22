# DEBT-240: Local Dev DATABASE_URL Points to Production Neon Branch

**Status:** Open
**Priority:** P1
**Date:** 2026-02-22

---

## Description

The local `.env.local` file sets `DATABASE_URL` to the **production** Neon Postgres endpoint (`ep-withered-cell-ah14ik13-pooler`) instead of the **development** branch endpoint (`ep-still-frog-ahx7bp6y-pooler`).

This contradicts the project's own documentation in `docs/dev/deployment-environments.md`, which specifies that local development should use the dev branch.

### Current State

| Environment | Neon Endpoint | Branch |
|-------------|---------------|--------|
| `.env.local` (local dev) | `ep-withered-cell-ah14ik13-pooler` | **main (PRODUCTION)** |
| Vercel Development | `ep-still-frog-ahx7bp6y-pooler` | dev |
| Vercel Preview | `ep-still-frog-ahx7bp6y-pooler` | dev |
| Vercel Production | `ep-withered-cell-ah14ik13-pooler` | main |

### Expected State

| Environment | Neon Endpoint | Branch |
|-------------|---------------|--------|
| `.env.local` (local dev) | `ep-still-frog-ahx7bp6y-pooler` | **dev** |
| Vercel Development | `ep-still-frog-ahx7bp6y-pooler` | dev |
| Vercel Preview | `ep-still-frog-ahx7bp6y-pooler` | dev |
| Vercel Production | `ep-withered-cell-ah14ik13-pooler` | main |

## Impact

- **Data safety risk:** Local development reads and writes directly to the production database. Any seed scripts, test data, or accidental mutations affect real production data.
- **Schema drift risk:** Running `drizzle-kit push` or migrations locally would apply schema changes to the production database.
- **Test pollution:** E2E tests and integration tests running locally create records in the production database.

## Resolution

1. Update `.env.local` to use the dev branch endpoint:
   ```
   DATABASE_URL="postgresql://neondb_owner:<dev-password>@ep-still-frog-ahx7bp6y-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
   ```
2. Verify the dev branch credentials (password may differ from production)
3. Confirm local dev server connects and all pages load correctly
4. Run integration tests against the dev branch to verify schema parity

## Verification

- `pnpm dev` starts without database errors
- `pnpm test:integration` passes against the dev branch
- `docs/dev/deployment-environments.md` matches actual `.env.local` configuration

## Related

- `docs/dev/deployment-environments.md` — documents expected environment mapping
- `.env.local` (gitignored) — the file that needs updating
- `.env.example` — template for new developers
- Discovered during Vercel environment audit (DEBT-239 session)
