# DEBT-041: SKIP_CLERK Production Safety Gap

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-01
**Resolved:** 2026-02-02

---

## Description

The environment validation in `lib/env.ts` rejects `NEXT_PUBLIC_SKIP_CLERK=true` in production runtime.

```typescript
// validateEnv() in lib/env.ts
const isProductionRuntime =
  process.env.VERCEL_ENV === 'production' ||
  (process.env.NODE_ENV === 'production' &&
    process.env.npm_lifecycle_event !== 'build');

if (isProductionRuntime && skipClerk) {
  throw new Error('NEXT_PUBLIC_SKIP_CLERK must not be true in production');
}
```

Rationale:

1. We must allow `NEXT_PUBLIC_SKIP_CLERK=true` during `next build` (CI fork PRs with no secrets), even though Next sets `NODE_ENV=production` for builds.
2. We must forbid `NEXT_PUBLIC_SKIP_CLERK=true` at production runtime to prevent accidentally bypassing authentication.

## Impact

- **Security risk:** Authentication bypass possible in misconfigured deployments
- **Deployment portability:** Logic assumes Vercel-specific environment variables

## Location

- `validateEnv()` in `lib/env.ts`

## Resolution

We treat production runtime as:

- Vercel production deploys (`VERCEL_ENV=production`), or
- `NODE_ENV=production` when not running the build script (`npm_lifecycle_event !== 'build'`).

This preserves CI/local build ergonomics while failing closed in production runtime, including non‑Vercel deployments.

## Verification

- [x] Verified unit test coverage for production runtime rejection
- [x] Verified `NEXT_PUBLIC_SKIP_CLERK=true` remains allowed for CI builds
- [x] Documented behavior in `.env.example`

## Related

- `.env.example` - Environment variable documentation
- SPEC-008 (Auth Gateway) - Clerk authentication integration
- Security best practices for authentication bypasses
