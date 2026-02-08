# BUG-115: DEBT-160 CRON_SECRET Startup Validation Crashes Production Build

**Status:** Resolved
**Priority:** P0
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

The Vercel production deployment fails during `next build`'s "Collecting page data" phase with:

```text
Invalid environment variables: { CRON_SECRET: [ 'Required' ] }
Error: Failed to collect page data for /api/health
```

Preview/dev deployments are unaffected. Only the production environment (`VERCEL_ENV=production`) crashes.

## Root Cause

**Introduced by:** DEBT-160 (commit `018acf1`)

DEBT-160 added import-time validation in `lib/env.ts:164-167` to require `CRON_SECRET` when `isProductionRuntime === true`:

```typescript
if (isProductionRuntime && !parsed.data.CRON_SECRET) {
  logInvalidEnv({ CRON_SECRET: ['Required'] });
  throw new Error('Invalid environment variables');
}
```

This validation runs at module load time (`export const env = validateEnv()` at line 181), which means it executes during the build's "Collecting page data" phase — not just at runtime.

### Why it triggers during build

The code comment at `lib/env.ts:95-104` states:

> `VERCEL_ENV` is a runtime-only variable injected by Vercel.

**This is incorrect.** `VERCEL_ENV` is available during both the Build Step and Function execution on Vercel. It is not inlined into the JavaScript bundle by Turbopack (unlike `NODE_ENV`), but it IS available as a regular `process.env` variable during the build process.

For production deployments (pushes to `main`), Vercel sets `VERCEL_ENV=production` during the build. So `isProductionRuntime` evaluates to `true` even at build time.

### The import chain that triggers it

```text
/api/health/route.ts  →  imports lib/db.ts  →  imports lib/env.ts  →  validateEnv() at module scope
```

The health route doesn't use `CRON_SECRET` at all. It only needs a database connection. But because `lib/db.ts` imports `lib/env.ts`, and env validation runs eagerly at module load, the `CRON_SECRET` requirement blocks ALL routes from loading — not just the cron route.

### Why preview/dev works

Preview deployments set `VERCEL_ENV=preview`, so `isProductionRuntime` is `false`, and the `CRON_SECRET` check is skipped.

## Impact

- **P0 — Production is down.** The main deployment fails to build entirely.
- **All routes blocked** — the health check, billing webhooks, practice API, everything. A single missing env var in a module loaded by a non-cron route crashes the entire deployment.
- **False sense of security** — DEBT-160 was intended to catch missing `CRON_SECRET` at "startup," but on Vercel, "startup" happens during the build, not at first request.

## The Defense-in-Depth That Already Exists

The cron route itself (`app/api/cron/reconcile-stripe-subscriptions/route.ts:46-55`) already validates `CRON_SECRET` at request time:

```typescript
const cronSecret = container.env.CRON_SECRET ?? null;
if (!cronSecret) {
  container.logger.error(
    { route: '/api/cron/reconcile-stripe-subscriptions' },
    'CRON_SECRET is not configured',
  );
  return NextResponse.json(
    { error: 'CRON_SECRET is not configured' },
    { status: 503 },
  );
}
```

This is the correct validation point. It:
- Only blocks the cron route, not all routes
- Returns 503 with a clear error message
- Logs the issue server-side
- Runs at actual request time, not build time

## Resolution

1. Removed import-time `CRON_SECRET` startup validation from `lib/env.ts` so missing cron secrets no longer crash unrelated routes during build-time module evaluation.
2. Simplified production detection to rely on `VERCEL_ENV === 'production'`, which correctly excludes preview and CI E2E runtime flows.
3. Updated `lib/env.ts` commentary to document build-time/runtime `VERCEL_ENV` behavior and to keep request-time-only secret validation at usage boundaries.
4. Updated `lib/env.test.ts` to assert missing `CRON_SECRET` is allowed at startup (including production), while cron route validation remains responsible for request-time enforcement.

### Best Practice References

- [T3 Env](https://env.t3.gg/docs/nextjs) recommends separating build-time vs runtime validation for server-only secrets
- [Vercel Environment Variables docs](https://vercel.com/docs/environment-variables) confirm env vars are available during both Build Step and Function execution
- [Next.js env docs](https://nextjs.org/docs/pages/guides/environment-variables) note that module-level code runs during "collecting page data"

## Verification

- [x] `lib/env.ts` no longer throws for missing `CRON_SECRET`
- [x] `VERCEL_ENV` comment is accurate and scoped to build/runtime behavior
- [x] `lib/env.test.ts` includes startup coverage for missing `CRON_SECRET`
- [x] Cron route validation remains at request time (`503` when missing secret)
- [x] Local gates pass (`typecheck`, `lint`, unit tests)

## Related

- `lib/env.ts:164-167` — the problematic validation
- `lib/env.ts:95-104` — the misleading `VERCEL_ENV` comment
- `app/api/cron/reconcile-stripe-subscriptions/route.ts:46-55` — existing request-time validation
- `app/api/health/route.ts` → `lib/db.ts` → `lib/env.ts` — the import chain
- DEBT-160 — the change that introduced this regression
