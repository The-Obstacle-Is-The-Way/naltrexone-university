# DEBT-161: Incomplete CSP Headers (Missing script-src, style-src, default-src)

**Status:** Invalidated (False Positive)
**Priority:** P2
**Date:** 2026-02-07
**Invalidated:** 2026-02-08

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

This finding was invalidated after first-principles verification of the current CSP ownership model:

- CSP is intentionally delegated to Clerk middleware in `proxy.ts` (see BUG-071 and BUG-063 resolutions)
- `CLERK_CSP_DIRECTIVES` in this repo are app-specific overrides/merges, not the full emitted CSP
- Forcing a hand-rolled full directive set in-repo would regress the established Clerk-owned CSP strategy and risks repeating prior production breakages

## Resolution

No code change required. The report conflated "partial override object" with "final response CSP header."

## Verification

- [x] Verified CSP ownership via Clerk middleware integration docs in `docs/vendor-docs/clerk.md`
- [x] Verified prior CSP regression history and resolution path in BUG-071/BUG-063 archives
- [x] Confirmed current implementation aligns with existing SSOT direction (delegate CSP baseline to Clerk)

## Related

- `proxy.ts:9-16`
- Clerk CSP requirements documentation
