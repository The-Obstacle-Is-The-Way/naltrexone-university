# BUG-136: Logger Uses Unreliable Inlined NODE_ENV for Log Level Selection

**Status:** Open
**Priority:** P2
**Date:** 2026-02-16

---

## Description

`lib/logger.ts` uses `process.env.NODE_ENV` to determine the log level, but the codebase's own `lib/env.ts:99-104` explicitly documents that `NODE_ENV` is unreliable because Turbopack inlines it as `'production'` during `next build`. This causes incorrect log levels in Vercel preview environments.

**Observed:** In Vercel preview deployments (`VERCEL_ENV=preview`), the logger defaults to `'info'` because the inlined `NODE_ENV` is `'production'`.

**Expected:** Preview environments should use `'debug'` level for better observability during staging/QA.

## Evidence: Full Vertical Trace

### 1. The Bug — `lib/logger.ts:6-12`

```typescript
const level =
  envLevel ||
  (process.env.NODE_ENV === 'production'
    ? 'info'
    : process.env.NODE_ENV === 'test'
      ? 'silent'
      : 'debug');
```

### 2. The Same Codebase Documents Why This Is Wrong — `lib/env.ts:95-112`

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

The team already solved this problem in `env.ts` using `VERCEL_ENV`. The logger was not updated.

### 3. Why Tests Don't Catch It — `lib/logger.test.ts:31-37`

```typescript
it('defaults to info in production when LOG_LEVEL is unset', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('LOG_LEVEL', '');
  const { logger } = await importLogger();
  expect(logger.level).toBe('info');
});
```

Tests use `vi.stubEnv()` which modifies `process.env` at runtime. But Turbopack inlining replaces `process.env.NODE_ENV` with a string literal at build time. Tests cannot reproduce this behavior.

### 4. The `LOG_LEVEL` Escape Hatch — `lib/logger.ts:4`

```typescript
const envLevel = process.env.LOG_LEVEL?.trim();
```

`LOG_LEVEL` is NOT inlined by Turbopack (not a `NEXT_PUBLIC_*` var), so it remains a live lookup. Setting `LOG_LEVEL=debug` on Vercel preview would work. But the **default fallback** behavior is wrong.

### 5. Impact on Environments

| Environment | `process.env.NODE_ENV` (inlined) | `VERCEL_ENV` (live) | Logger Level | Correct? |
|-------------|----------------------------------|---------------------|--------------|----------|
| Production  | `'production'`                   | `'production'`      | `'info'`     | Yes |
| Preview     | `'production'`                   | `'preview'`         | `'info'`     | **No — should be `'debug'`** |
| Local dev   | `'development'`                  | undefined           | `'debug'`    | Yes |
| CI E2E      | `'production'` (after build)     | undefined           | `'info'`     | **No — should be `'silent'`** |

## Root Cause

The logger was created before the Turbopack inlining issue was discovered. When `lib/env.ts` was updated with the `VERCEL_ENV` workaround (around BUG-002/BUG-115), the logger was not updated to match.

## Fix

Align with the existing `VERCEL_ENV` pattern from `lib/env.ts`:

```typescript
const runtimeEnv = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
const level =
  envLevel ||
  (runtimeEnv === 'production'
    ? 'info'
    : runtimeEnv === 'test'
      ? 'silent'
      : 'debug');
```

Note: This preserves the existing behavior outside Vercel (`NODE_ENV` drives the default), while allowing Vercel preview deployments (`VERCEL_ENV=preview`) to correctly default to `'debug'`.

## Verification

- [ ] Unit test: Stub `VERCEL_ENV=production` → level is `'info'`
- [ ] Unit test: Stub `VERCEL_ENV=preview`, no `LOG_LEVEL` → level is `'debug'`
- [ ] Manual: Deploy to Vercel preview and confirm debug logs appear

## Related

- `lib/logger.ts:4-12` — Log level selection
- `lib/logger.test.ts:31-37` — Tests that pass but don't cover Turbopack behavior
- `lib/env.ts:95-112` — Documents the `NODE_ENV` inlining problem and `VERCEL_ENV` solution
- [BUG-002](../_archive/bugs/bug-002-next-build-node-env-skip-clerk.md) — Original `NODE_ENV` build issue
- [BUG-115](../_archive/bugs/bug-115-cron-secret-validation-crashes-production-build.md) — CRON_SECRET startup validation crash from same root cause
