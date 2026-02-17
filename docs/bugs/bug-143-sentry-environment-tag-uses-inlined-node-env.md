# BUG-143: Sentry Environment Tag Uses Inlined NODE_ENV — Preview Errors Report as Production

**Status:** Open
**Priority:** P3
**Date:** 2026-02-16

---

## Description

Both Sentry configuration files (`instrumentation.ts` and `sentry.client.config.ts`) pass `process.env.NODE_ENV` as the `environment` field. This is the same root cause as BUG-136: Turbopack inlines `process.env.NODE_ENV` as `'production'` during `next build`, causing Vercel preview deployments to report all Sentry errors as `environment: 'production'`. Preview and production errors become indistinguishable in the Sentry dashboard.

**Observed:** In Vercel preview deployments, Sentry events have `environment: 'production'`.

**Expected:** Preview events should have `environment: 'preview'` (matching `VERCEL_ENV`).

## Evidence: Full Vertical Trace

### 1. The Bug — Server-Side: `instrumentation.ts:13`

```typescript
export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    environment: process.env.NODE_ENV,
  });
}
```

`instrumentation.ts` runs server-side during Next.js server initialization. Turbopack inlines `process.env.NODE_ENV` in server bundles as `'production'` (documented in `lib/env.ts:99-104`).

### 2. The Bug — Client-Side: `sentry.client.config.ts:11`

```typescript
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment: process.env.NODE_ENV,
  });
}
```

Client bundles **always** inline `process.env.NODE_ENV` as `'production'` during `next build` — this is standard webpack/Turbopack behavior, not specific to Turbopack. The client-side fix requires a different approach (see Fix section).

### 3. The Same Codebase Documents Why This Is Wrong — `lib/env.ts:95-112`

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

The team already solved this problem for `isProductionRuntime`. Neither the logger (BUG-136) nor Sentry was updated.

### 4. Tests Lock In Wrong Behavior — `sentry-config.test.ts:51,70,101,118`

```typescript
it('returns initialized client with safe defaults when NEXT_PUBLIC_SENTRY_DSN is set', async () => {
  process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://examplePublicDsn';
  await import('./sentry.client.config');

  expect(initMock).toHaveBeenCalledWith({
    dsn: 'https://examplePublicDsn',
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment: process.env.NODE_ENV,
  });
});
```

Tests pass because Vitest runs without Turbopack inlining — `process.env.NODE_ENV` is the real runtime value (`'test'`). The tests cannot reproduce the inlining behavior.

### 5. Impact on Environments

| Environment | `process.env.NODE_ENV` (inlined) | `VERCEL_ENV` (live) | Sentry environment | Correct? |
|-------------|----------------------------------|---------------------|-------------------|----------|
| Production  | `'production'`                   | `'production'`      | `'production'`    | Yes |
| Preview     | `'production'`                   | `'preview'`         | `'production'`    | **No — should be `'preview'`** |
| Local dev   | `'development'`                  | undefined           | `'development'`   | Yes |
| CI E2E      | `'production'` (after build)     | undefined           | `'production'`    | **No — should be `'test'`** |

### 6. Practical Impact

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
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
```

`VERCEL_ENV` is a live runtime lookup on the server (not inlined by Turbopack). When present, it correctly reports `'production'`, `'preview'`, or `'development'`. Falls back to `NODE_ENV` for non-Vercel environments (local dev, CI).

**Client-side** (`sentry.client.config.ts`) — Requires build-time injection:

```typescript
Sentry.init({
  dsn,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
});
```

Note: `NEXT_PUBLIC_VERCEL_ENV` must be explicitly set in Vercel project settings (it's not auto-populated like `VERCEL_ENV`). Set it per deployment environment (Production = `production`, Preview = `preview`, Development = `development`) so the client bundle can inline the correct value.

## Verification

- [ ] Unit test: Stub `VERCEL_ENV=production` → `Sentry.init` receives `environment: 'production'`
- [ ] Unit test: Stub `VERCEL_ENV=preview` → `Sentry.init` receives `environment: 'preview'`
- [ ] Update `sentry-config.test.ts` assertions to expect `VERCEL_ENV`-based environment
- [ ] Manual: Deploy to Vercel preview and confirm Sentry events show `environment: 'preview'`
- [ ] Configure `NEXT_PUBLIC_VERCEL_ENV` in Vercel project settings

## Related

- `instrumentation.ts:13` — Server-side Sentry environment tag
- `sentry.client.config.ts:11` — Client-side Sentry environment tag
- `sentry-config.test.ts:51,70,101,118` — Tests that lock in wrong behavior
- `lib/env.ts:95-112` — Documents the `NODE_ENV` inlining problem and `VERCEL_ENV` solution
- [BUG-136](bug-136-logger-uses-inlined-node-env-for-level.md) — Same root cause affecting logger level
