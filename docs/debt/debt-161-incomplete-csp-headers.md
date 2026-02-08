# DEBT-161: Incomplete CSP Headers (Missing script-src, style-src, default-src)

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The CSP configuration in `proxy.ts` only defines a subset of directives:

```typescript
const CLERK_CSP_DIRECTIVES = {
  'base-uri': ['self'],
  'connect-src': ['ws:', 'wss:'],
  'font-src': ['self', 'data:', 'https:'],
  'frame-ancestors': ['none'],
  'img-src': ['self', 'data:', 'blob:', 'https:'],
  'object-src': ['none'],
};
```

Missing directives:
- `default-src` — No fallback policy for unlisted resource types
- `script-src` — No restriction on script sources (relies on Next.js defaults)
- `style-src` — No restriction on style sources
- `upgrade-insecure-requests` — No HTTPS enforcement directive
- `connect-src` allows `ws://` (unencrypted WebSocket)

## Impact

- Incomplete CSP means some resource types fall back to browser defaults (which are permissive)
- XSS attacks could inject scripts if not restricted by Next.js's built-in CSP handling
- Low severity because Next.js provides some defaults, but defense-in-depth principle suggests explicit configuration

## Resolution

Extend CSP with:
- `default-src: 'self'`
- `script-src` with appropriate values for Next.js
- `style-src` with appropriate values
- `upgrade-insecure-requests` in production
- Replace `ws:` with `wss:` only in connect-src

Note: Must be tested carefully with Clerk components, which require specific CSP allowances.

## Verification

- [ ] Full CSP header set defined
- [ ] Tested with Clerk sign-in/sign-up flows
- [ ] No console CSP errors in production

## Related

- `proxy.ts:9-16`
- Clerk CSP requirements documentation
