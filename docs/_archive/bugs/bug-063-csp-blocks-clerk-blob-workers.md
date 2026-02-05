# BUG-063: CSP Blocks Clerk Blob Workers

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-05
**Resolved:** 2026-02-05

---

## Description

Clerk's SDK creates Web Workers from blob URLs, which are blocked by the Content Security Policy. This causes console errors but does not appear to block core functionality.

**Error Message:**

```text
Creating a worker from 'blob:http://localhost:3000/...' violates the following
Content Security Policy directive: "script-src 'self' 'unsafe-inline' https: 'unsafe-eval'".
Note that 'worker-src' was not explicitly set, so 'script-src' is used as a fallback.
```

**Observed Behavior:**
- Multiple CSP violation errors in browser console
- Clerk authentication still works (sign-in, sign-up functional)
- No visible user impact

**Expected Behavior:**
- No CSP violation errors
- Or explicitly accept this as a known limitation

---

## Steps to Reproduce

1. Start dev server (`pnpm dev`)
2. Open browser DevTools → Console tab
3. Navigate to any page (homepage, sign-in, etc.)
4. Observe CSP violation errors related to blob workers

---

## Root Cause

The app’s CSP did not include a `worker-src` directive. Without it, browsers fall back to `script-src`, which doesn't allow `blob:` URLs. Clerk's SDK attempts to create Web Workers from blob URLs for performance optimization.

---

## Fix

Ensure CSP includes `worker-src 'self' blob:`.

**Current implementation (as of 2026-02-05):** CSP is generated via Clerk middleware in `proxy.ts` using `contentSecurityPolicy` options, and Clerk’s defaults include `worker-src blob:`.

---

## Verification

- [x] CSP includes `worker-src blob:` via Clerk middleware defaults (`proxy.ts`)
- [x] Unit test asserts CSP options are configured on middleware (`proxy.test.ts`)
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm test --run`

---

## Related

- Clerk documentation on CSP: https://clerk.com/docs/security/content-security-policy
- Next.js security headers documentation
