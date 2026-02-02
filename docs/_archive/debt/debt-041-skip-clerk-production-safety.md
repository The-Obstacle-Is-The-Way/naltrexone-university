# DEBT-041: SKIP_CLERK Production Safety Gap

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-01
**Resolved:** 2026-02-02

---

## Description

The environment validation in `lib/env.ts` checks for `NEXT_PUBLIC_SKIP_CLERK=true` in production:

```typescript
// lib/env.ts:59-63
if (process.env.VERCEL_ENV === 'production' && skipClerk) {
  throw new Error(
    'NEXT_PUBLIC_SKIP_CLERK must not be true in production (VERCEL_ENV=production)',
  );
}
```

This check only validates when `VERCEL_ENV === 'production'`. However:

1. `VERCEL_ENV` might not be set in non-Vercel deployments (self-hosted, Docker, etc.)
2. `VERCEL_ENV` could be `'preview'` or `'development'` but still be a sensitive environment
3. If the environment detection fails, the flag could accidentally bypass authentication

## Impact

- **Security risk:** Authentication bypass possible in misconfigured deployments
- **Silent failure:** No warning if `VERCEL_ENV` is missing or unexpected
- **Deployment portability:** Logic assumes Vercel-specific environment variables

## Location

- `lib/env.ts:59-63`

## Resolution

This is intentionally **Vercel-production-specific**.

- In this codebase, production is expected to run on Vercel (SSOT: `docs/specs/master_spec.md` §10).
- We must allow `NEXT_PUBLIC_SKIP_CLERK=true` during `next build` in CI fork PRs (no secrets), even though Next sets `NODE_ENV=production` during builds.
- We still block `NEXT_PUBLIC_SKIP_CLERK=true` on Vercel production deploys via `VERCEL_ENV=production` (and this is covered by unit tests).

To reduce confusion and misconfiguration risk, we documented this behavior directly in `.env.example`.

## Verification

- [x] Verified unit test coverage for Vercel production rejection
- [x] Verified `NEXT_PUBLIC_SKIP_CLERK=true` remains allowed for CI builds
- [x] Documented behavior in `.env.example`

## Related

- `.env.example` - Environment variable documentation
- SPEC-008 (Auth Gateway) - Clerk authentication integration
- Security best practices for authentication bypasses
