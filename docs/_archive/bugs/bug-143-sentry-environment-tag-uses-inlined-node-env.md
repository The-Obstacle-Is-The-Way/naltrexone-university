# BUG-143: Sentry Environment Tag Uses Inlined NODE_ENV — Preview Errors Report as Production

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-16
**Resolved:** 2026-02-17
**Component:** Observability — Sentry

---

## Description

Prior to 2026-02-17, both Sentry configuration files (`instrumentation.ts` and `sentry.client.config.ts`) used `process.env.NODE_ENV` as the `environment` field. This is the same root cause as BUG-136: `process.env.NODE_ENV` is inlined as `'production'` in production builds, causing Vercel preview deployments to report Sentry events as `environment: 'production'`. Preview and production errors became indistinguishable in the Sentry dashboard.

**Observed (pre-fix):** In Vercel preview deployments, Sentry events had `environment: 'production'`.

**Expected:** Preview events should have `environment: 'preview'` (matching `VERCEL_ENV`).

**Now (fixed):** Server-side Sentry uses `VERCEL_ENV` (runtime) and client-side Sentry uses `NEXT_PUBLIC_VERCEL_ENV` (build-time, injected from `VERCEL_ENV` via `next.config.ts`).

## Evidence: Full Vertical Trace

### 1. The Fix (Current) — Server-Side: `instrumentation.ts:3-17`

```typescript
export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    return;
  }

  const environment =
    process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim();

  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    environment,
  });
}
```

`instrumentation.ts` runs server-side during Next.js server initialization. `VERCEL_ENV` remains a live runtime lookup on Vercel (not inlined by Turbopack), so preview deployments correctly tag events as `'preview'`.

### 2. The Fix (Current) — Client-Side: `sentry.client.config.ts:3-16`

```typescript
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  const environment =
    process.env.NEXT_PUBLIC_VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim();

  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment,
  });
}
```

Client bundles **always** inline `process.env.NODE_ENV` as `'production'` during `next build` (standard webpack/Turbopack behavior). `NEXT_PUBLIC_VERCEL_ENV` is injected at build time, allowing preview builds to inline `'preview'` automatically.

### 3. Client Environment Injection — `next.config.ts:7-11`

```typescript
  // Expose Vercel runtime environment to the browser bundle so client-side
  // Sentry config can tag preview deployments correctly.
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? '',
  },
```

### 4. The Same Codebase Documents Why This Is Needed — `lib/env.ts:95-112`

```typescript
  // VERCEL_ENV is injected by Vercel and available during both the Build Step
  // and Function execution. Unlike NODE_ENV, it is never inlined into the
  // JavaScript bundle by Turbopack — it remains a live process.env lookup.
  //
  // NODE_ENV is NOT reliable here because:
  //   1. `next build` sets NODE_ENV='production' internally
  //   2. Turbopack inlines process.env.NODE_ENV as 'production' in server bundles
  //   3. At runtime the baked value overrides the actual process env
  //   4. This causes CI E2E (NODE_ENV=test) and Vercel preview (VERCEL_ENV=preview)
  //      to be misidentified as production
  //
  // IMPORTANT: Because VERCEL_ENV is available at build time, any validation
  // gated on isProductionRuntime also runs during `next build`'s "Collecting
  // page data" phase. Only gate env vars here that MUST be present for the
  // build to succeed (e.g., Clerk keys for auth middleware). Secrets only
  // needed at request time (e.g., CRON_SECRET) should be validated at their
  // point of use, not here.
  const isProductionRuntime = process.env.VERCEL_ENV === 'production';
```

The team already solved this problem for `isProductionRuntime`. The logger (BUG-136) and Sentry now follow the same `VERCEL_ENV` pattern.

### 5. Tests Assert Environment Selection — `sentry-config.test.ts:44-161`

```typescript
it('returns initialized client with safe defaults when NEXT_PUBLIC_SENTRY_DSN is set', async () => {
  process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://examplePublicDsn';
  await import('./sentry.client.config');

  expect(initMock).toHaveBeenCalledWith({
    dsn: 'https://examplePublicDsn',
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment: getClientEnvironment(),
  });
});
```

Tests pass because Vitest runs without Turbopack inlining — `process.env.NODE_ENV` is the real runtime value (`'test'`). The tests cannot reproduce the inlining behavior.

### 6. Impact on Environments

| Environment | `process.env.NODE_ENV` (inlined) | `VERCEL_ENV` (live) | Sentry environment | Correct? |
|-------------|----------------------------------|---------------------|-------------------|----------|
| Production  | `'production'`                   | `'production'`      | `'production'`    | Yes |
| Preview     | `'production'`                   | `'preview'`         | `'preview'`       | Yes |
| Local dev   | `'development'`                  | undefined           | `'development'`   | Yes |
| CI / non-Vercel | `'production'` or `'test'` (runtime) | undefined | `NODE_ENV` | Yes |

### 7. Practical Impact

- Sentry errors from preview deployments appear alongside production errors in the dashboard
- No way to filter `environment: 'preview'` to isolate staging/QA issues
- A spike in preview errors could be mistaken for a production incident
- Sentry alerts (if configured) would trigger for preview errors as if they were production

## Root Cause

Same as BUG-136: `instrumentation.ts` and `sentry.client.config.ts` were created before the `VERCEL_ENV` workaround was established in `lib/env.ts`. When the workaround was added, these files were not updated.

## Fix

**Server-side** (`instrumentation.ts`) — Use `VERCEL_ENV` with `NODE_ENV` fallback:

```typescript
Sentry.init({
  dsn,
  tracesSampleRate: 0,
  environment: process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim(),
});
```

`VERCEL_ENV` is a live runtime lookup on the server (not inlined by Turbopack). When present, it correctly reports `'production'`, `'preview'`, or `'development'`. Falls back to `NODE_ENV` for non-Vercel environments (local dev, CI).

**Client-side** (`sentry.client.config.ts`) — Use `NEXT_PUBLIC_VERCEL_ENV` (build-time) with `NODE_ENV` fallback:

```typescript
Sentry.init({
  dsn,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  environment:
    process.env.NEXT_PUBLIC_VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim(),
});
```

`NEXT_PUBLIC_VERCEL_ENV` is injected from `VERCEL_ENV` via `next.config.ts`, so Vercel preview builds inline `'preview'` automatically.

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --run`
- Unit tests cover `VERCEL_ENV` and `NEXT_PUBLIC_VERCEL_ENV` precedence in `sentry-config.test.ts`

## Related

- `instrumentation.ts:3-17` — Server-side Sentry environment tag
- `sentry.client.config.ts:3-16` — Client-side Sentry environment tag
- `next.config.ts:7-11` — Injects `NEXT_PUBLIC_VERCEL_ENV` for client bundles
- `sentry-config.test.ts:44-161` — Environment selection tests
- `lib/env.ts:95-112` — Documents the `NODE_ENV` inlining problem and `VERCEL_ENV` solution
- [BUG-136](bug-136-logger-uses-inlined-node-env-for-level.md) — Same root cause affecting logger level
