# DEBT-432: postgres-js `prepare: true` default is unverified against Neon's pooled (PgBouncer) endpoint, which this app's docs say `DATABASE_URL` uses

**Status:** Open
**Priority:** P3
**Date:** 2026-07-01

---

## Description

`lib/db.ts:15-20` constructs the driver as `postgres(connectionString, { idle_timeout: 20, connection: POSTGRES_CONNECTION_PARAMETERS })` with no `prepare` or `max` override. The installed `postgres` package (`postgres@3.4.x`) defaults to `prepare: true` (server-side prepared statements) and `max: 10`.

`docs/vendor-docs/postgres.md` documents that `DATABASE_URL` is expected to be Neon's **pooled** (`-pooler`, PgBouncer) endpoint for application queries, with the direct endpoint reserved for migrations — and separately notes this app currently uses a single `DATABASE_URL` for both. This repository has no record of the actual host configured per Vercel environment (`.env.example` redacts it, as does `docs/dev/deployment-environments.md`), so whether the pooled endpoint is genuinely what's wired into production could not be confirmed from the repo alone.

PgBouncer running in transaction-pooling mode is session-scoped for prepared statements: a prepared statement created on one physical backend connection is not portable to the different backend connection a later statement in the same logical session might get routed to under transaction pooling. This is a well-documented category of incompatibility between `postgres-js`'s default `prepare: true` and PgBouncer transaction-mode pooling — not repo-specific speculation, but its applicability here depends entirely on the unconfirmed endpoint type above.

This has become more consequential now than it was before Track A: this PR added materially heavier transactional/locking usage (nested transactions, `SELECT ... FOR UPDATE`, `REPEATABLE READ`) on top of this same driver configuration, and none of that new usage was previously exercised enough to have surfaced a pooling-mode incompatibility if one exists.

## Impact

If the pooled endpoint is in fact what's configured, the failure mode under concurrent load is `prepared statement "sN" already exists` / `prepared statement "sN" does not exist` errors — intermittent, load-dependent, and hard to reproduce locally against a direct connection. Unconfirmed whether this is currently live; this doc exists to make the question explicit and trackable rather than to assert an active incident.

## Resolution

Check the actual `DATABASE_URL` host configured in Vercel prod/preview (not committed to the repo) to determine pooled vs. direct. If pooled, either set `prepare: false` in `lib/db.ts`, or confirm Neon's specific PgBouncer configuration already handles this transparently (some managed Postgres poolers proxy prepared statements safely; this needs an explicit check against Neon's current documented behavior, not an assumption either way). Document the decision directly in `lib/db.ts` or `docs/vendor-docs/postgres.md` once resolved, since this is exactly the kind of driver-level assumption that's easy to silently invalidate on a future Neon plan/config change.

## Verification

Confirm the production `DATABASE_URL` host shape (pooled vs. direct) and record it here or in `docs/vendor-docs/postgres.md`. If pooled and `prepare: true` is confirmed unsafe, add a load test that issues concurrent queries through the app's connection singleton and checks for prepared-statement errors before and after any `prepare: false` change.

## Related

- PR #537 (surfaced by the same audit that reviewed this PR's new transaction/locking usage, not caused by it)
- `lib/db.ts:15-20`, `lib/db-connection-options.ts`
- `docs/vendor-docs/postgres.md`
- Found via a systematic driver/connection-pooling audit (2026-07-01); explicitly unconfirmed pending an out-of-repo environment check — do not treat as a confirmed live incident
