# DEBT-198: Missing Baseline Content-Security-Policy Header

**Status:** Open
**Priority:** P3
**Date:** 2026-02-08

---

## Description

The `next.config.ts` configures security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, `Strict-Transport-Security`) but does not include a `Content-Security-Policy` header.

The Clerk middleware in `proxy.ts` does configure CSP directives, but this only applies when Clerk middleware is active (not when `SKIP_CLERK=true` in development).

## Affected Files

| File | Issue |
|------|-------|
| `next.config.ts` | No CSP header in `headers()` config |
| `proxy.ts` | CSP only applied via Clerk middleware |

## Impact

- Without a baseline CSP, the app relies entirely on Clerk middleware for CSP protection
- In development with `SKIP_CLERK=true`, no CSP is applied at all
- A baseline CSP would provide defense-in-depth against XSS even if other protections fail
- The existing `next.config.test.ts` explicitly asserts CSP is absent

## Resolution

Add a baseline CSP header in `next.config.ts`:

```typescript
{
  key: 'Content-Security-Policy',
  value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; img-src 'self' data: blob: https:; font-src 'self' data: https:;",
}
```

The Clerk middleware can then augment this baseline with its own directives.

## Verification

- `pnpm build` — no CSP violations in build output
- Manual test: verify app loads correctly with the baseline CSP
- Update `next.config.test.ts` to assert the baseline CSP is present

## Related

- Security audit finding (defense-in-depth)
