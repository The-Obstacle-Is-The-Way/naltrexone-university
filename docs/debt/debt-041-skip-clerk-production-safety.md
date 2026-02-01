# DEBT-041: SKIP_CLERK Production Safety Gap

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

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

Consider a stricter validation strategy:

```typescript
// Option 1: Explicit allowlist of development environments
const allowSkipClerk = ['development', 'test'].includes(process.env.NODE_ENV);

if (skipClerk && !allowSkipClerk) {
  throw new Error(
    'NEXT_PUBLIC_SKIP_CLERK=true is only allowed in development/test environments',
  );
}

// Option 2: Require explicit opt-in environment variable for skip mode
if (skipClerk && process.env.ALLOW_SKIP_CLERK !== 'true') {
  throw new Error(
    'NEXT_PUBLIC_SKIP_CLERK=true requires ALLOW_SKIP_CLERK=true (development only)',
  );
}
```

## Verification

- [ ] Update environment validation with stricter checks
- [ ] Add unit test for production safety rejection
- [ ] Document allowed environments in `.env.example`
- [ ] Verify CI/CD pipeline doesn't accidentally enable skip mode

## Related

- `.env.example` - Environment variable documentation
- SPEC-008 (Auth Gateway) - Clerk authentication integration
- Security best practices for authentication bypasses
