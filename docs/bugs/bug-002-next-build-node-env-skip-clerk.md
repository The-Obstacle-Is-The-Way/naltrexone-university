# BUG-002: `NEXT_PUBLIC_SKIP_CLERK` blocked `next build` due to `NODE_ENV` override

**Status:** Resolved
**Date:** 2026-02-01

## Summary

The codebase supports a CI-only escape hatch (`NEXT_PUBLIC_SKIP_CLERK=true`) so fork PRs (no secrets) can still run `next build` without valid Clerk credentials. However, the env validation previously rejected `NEXT_PUBLIC_SKIP_CLERK=true` whenever `NODE_ENV === 'production'`.

In Next.js builds, `next build` forces `NODE_ENV=production`, even if CI sets `NODE_ENV=test`, causing CI builds to fail during prerender/route evaluation (e.g. `/api/health`).

## Fix

- Changed the production guard in `lib/env.ts` to use `VERCEL_ENV=production` (real production deploy signal) instead of `NODE_ENV=production` (build-time signal).

## Acceptance Criteria

- `next build` succeeds in CI fork mode with `NEXT_PUBLIC_SKIP_CLERK=true` and dummy Clerk keys.
- `NEXT_PUBLIC_SKIP_CLERK=true` is still rejected on Vercel production deploys (`VERCEL_ENV=production`).

