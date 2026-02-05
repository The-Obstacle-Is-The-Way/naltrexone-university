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

The Content Security Policy in `next.config.ts` does not include `blob:` in the `worker-src` directive. Clerk's SDK attempts to create Web Workers from blob URLs for performance optimization.

---

## Fix Options

### Option 1: Add `blob:` to worker-src (Recommended)

Update `next.config.ts` CSP headers to include:
```
worker-src 'self' blob:;
```

### Option 2: Accept as Known Limitation

Document that these errors are expected in development and do not affect production functionality. Clerk falls back to main-thread execution when workers fail.

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
