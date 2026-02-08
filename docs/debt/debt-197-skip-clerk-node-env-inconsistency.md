# DEBT-197: SKIP_CLERK Middleware Check Uses NODE_ENV Inconsistently

**Status:** Open
**Priority:** P2
**Date:** 2026-02-08

---

## Description

The `shouldBypassClerkAuth()` function in `proxy.ts` uses `process.env.NODE_ENV === 'production'` to prevent auth bypass in production. However, the env validation in `lib/env.ts` uses `process.env.VERCEL_ENV === 'production'` for the same purpose.

As documented in `lib/env.ts` (lines 96-111), `NODE_ENV` is unreliable because Turbopack inlines it. If `NODE_ENV` is not `'production'` at the edge runtime but `NEXT_PUBLIC_SKIP_CLERK` is `'true'`, all authentication could be bypassed.

## Affected Files

| File | Line | Check Used |
|------|------|------------|
| `proxy.ts` | 26 | `process.env.NODE_ENV === 'production'` |
| `lib/env.ts` | 167-168 | `process.env.VERCEL_ENV === 'production'` |

## Impact

- Low probability: the env validation in `lib/env.ts` would throw before the app starts if `NEXT_PUBLIC_SKIP_CLERK=true` and `VERCEL_ENV=production`
- However, the two different checks use different env vars (`NODE_ENV` vs `VERCEL_ENV`), creating a potential gap
- If a deployment has `NEXT_PUBLIC_SKIP_CLERK=true` and `VERCEL_ENV=production` but `NODE_ENV` is not `'production'` at the edge, auth is bypassed

## Resolution

Use `VERCEL_ENV` consistently in both locations, or remove the `NEXT_PUBLIC_SKIP_CLERK` bypass from the middleware layer entirely and only use it at the env validation level.

```typescript
// proxy.ts
if (process.env.VERCEL_ENV === 'production') {
  // Never bypass in production, regardless of NODE_ENV
  return false;
}
```

## Verification

- `pnpm test --run` — proxy tests pass
- Review Vercel deployment logs to confirm `VERCEL_ENV` is set correctly

## Related

- Security audit finding (middleware auth bypass)
