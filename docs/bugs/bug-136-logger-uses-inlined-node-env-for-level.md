# BUG-136: Logger Uses Unreliable Inlined NODE_ENV for Log Level Selection

**Status:** Open
**Priority:** P2
**Date:** 2026-02-16

---

## Description

`lib/logger.ts` uses `process.env.NODE_ENV` to determine the log level, but `lib/env.ts:99-104` explicitly documents that `NODE_ENV` is unreliable because Turbopack inlines it as `'production'` during `next build`. This causes incorrect log levels in non-production Vercel environments.

**Observed:** In Vercel preview deployments (`VERCEL_ENV=preview`), the logger defaults to `'info'` because the inlined `NODE_ENV` is `'production'`.

**Expected:** Preview environments should use `'debug'` level for better observability during staging/QA.

## Steps to Reproduce

1. Deploy to a Vercel preview environment
2. Observe that `process.env.NODE_ENV` is inlined as `'production'` by Turbopack
3. Logger defaults to `'info'` level instead of `'debug'`
4. Debug-level logs are suppressed in preview, reducing observability

## Root Cause

`lib/logger.ts:6-12`:
```typescript
const level =
  envLevel ||
  (process.env.NODE_ENV === 'production'
    ? 'info'
    : process.env.NODE_ENV === 'test'
      ? 'silent'
      : 'debug');
```

The codebase already solves this exact problem in `lib/env.ts:112` by using `VERCEL_ENV` instead of `NODE_ENV`, but the logger was not updated to match.

## Fix

Align with the existing `VERCEL_ENV` pattern from `lib/env.ts`:

```typescript
const isProductionRuntime = process.env.VERCEL_ENV === 'production';
const level =
  envLevel ||
  (isProductionRuntime
    ? 'info'
    : process.env.NODE_ENV === 'test'
      ? 'silent'
      : 'debug');
```

## Verification

- [ ] Unit test: Verify log level selection logic
- [ ] Manual: Deploy to Vercel preview and confirm debug logs appear

## Related

- `lib/logger.ts:4-12` — Log level selection
- `lib/env.ts:95-112` — Documents the `NODE_ENV` inlining problem and `VERCEL_ENV` solution
