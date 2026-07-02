# DEBT-432: postgres-js `prepare: true` vs Neon pooler concern

**Status:** Invalidated (false positive for the application Drizzle path)
**Priority:** ~~P3~~ N/A
**Date:** 2026-07-01
**Invalidated:** 2026-07-01

---

## Summary

The original debt item claimed this app might be using postgres-js server-side prepared statements (`prepare: true`) against a Neon pooled/PgBouncer endpoint, creating a possible `prepared statement "sN" already exists` / `does not exist` failure mode under transaction pooling.

The concern is refuted for the committed application query path. `lib/db.ts:15-20` does construct a `postgres` connection without overriding `prepare`, and installed `postgres@3.4.9` does default `prepare: true` in its connection options. However, this app does not issue application queries through the raw postgres-js tagged-template path. It wraps the connection in Drizzle (`lib/db.ts:25`), and Drizzle's postgres-js adapter executes prepared query text through `client.unsafe(query, params)` / `.values()` (`node_modules/.../drizzle-orm/postgres-js/session.js:31-44`). postgres-js `unsafe()` explicitly sets `prepare: false` for that query (`node_modules/.../postgres/src/index.js:119-125`).

So the app's Drizzle queries do not use server-side prepared statements even though the underlying connection object's default is `prepare: true`.

## Invalidation Reason

Verified from current source and installed package code:

1. `lib/db.ts:15-25` creates `conn = postgres(...)` and exports `db = drizzle(conn, { schema })`.
2. `node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/index.js:448-459` defaults `prepare` to `true` at the connection option level.
3. `node_modules/.pnpm/drizzle-orm@0.45.2_@opentelemetry+api@1.9.1_postgres@3.4.9/node_modules/drizzle-orm/postgres-js/session.js:31-44` executes Drizzle queries with `client.unsafe(query, params)` and `client.unsafe(query, params).values()`.
4. `node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/index.js:119-125` constructs `unsafe()` queries with `prepare: false`.
5. A source grep found no production application use of the raw postgres-js tagged-template connection outside this Drizzle wrapper. Direct postgres-js users are scripts/tests/E2E helpers, mostly with `max: 1` and/or explicit `.unsafe(...)`; they are not the serverless app singleton described by the original debt.

## Residual Note

If future production code starts using the raw `postgres` tagged-template API directly against a pooled Neon endpoint, this concern can become real and should be refiled against that concrete call site. The safe default is to keep production DB access behind Drizzle or to explicitly set `prepare: false` on any raw postgres-js pooler connection.

## Verification

No production code change required. This doc was archived as an invalidated debt item after source-level verification of the Drizzle adapter execution path.

## Related

- `lib/db.ts:15-25`
- `docs/vendor-docs/postgres.md`
- `node_modules/.pnpm/drizzle-orm@0.45.2_@opentelemetry+api@1.9.1_postgres@3.4.9/node_modules/drizzle-orm/postgres-js/session.js:31-44`
- `node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/index.js:119-125,448-459`
