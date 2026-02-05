# BUG-063: CSP Blocks Clerk Blob Workers

**Status:** Open
**Priority:** P3
**Date:** 2026-02-05

---

## Description

Clerk's SDK creates Web Workers from blob URLs, which are blocked by the Content Security Policy. This causes console errors but does not appear to block core functionality.

**Error Message:**
```
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

The Content Security Policy in `next.config.ts` (lines 8-20) does not include a `worker-src` directive. Without it, browsers fall back to `script-src`, which doesn't allow `blob:` URLs. Clerk's SDK attempts to create Web Workers from blob URLs for performance optimization.

**File:** `next.config.ts:8-20`

---

## Fix

Add `worker-src 'self' blob:` to the CSP array in `next.config.ts`:

```typescript
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  `script-src ${scriptSrc.join(' ')}`,
  "style-src 'self' 'unsafe-inline' https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",  // <-- ADD THIS LINE
].join('; ');
```

**Alternative:** Accept as known limitation since Clerk falls back to main-thread execution when workers fail (no user impact).

---

## Verification

- [ ] CSP headers updated in next.config.ts
- [ ] No CSP violation errors in console
- [ ] Clerk authentication still works
- [ ] Build passes (`pnpm build`)

---

## Related

- Clerk documentation on CSP: https://clerk.com/docs/security/content-security-policy
- Next.js security headers documentation
