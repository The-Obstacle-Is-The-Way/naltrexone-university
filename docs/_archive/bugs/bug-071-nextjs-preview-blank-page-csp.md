# BUG-071: Preview Deployment Renders Blank Page After CSP Tightening

**Status:** Resolved
**Priority:** P0
**Date:** 2026-02-05
**Resolved:** 2026-02-05

---

## Description

After tightening the Content Security Policy (CSP) by removing `'unsafe-inline'` from `script-src` in production, the Preview deployment rendered a blank white page.

This is a **ship blocker**: users cannot load the app, even though the server responds successfully.

## Steps to Reproduce

1. Deploy Preview with `NODE_ENV=production`.
2. Load any HTML route (e.g., `/`).
3. Observe a blank white screen.
4. In DevTools Console, observe CSP violations for blocked inline scripts.

## Root Cause

The repository was setting a **static** CSP header via `next.config.ts` headers.

Removing `'unsafe-inline'` from `script-src` without implementing a nonce/hash strategy blocks inline scripts required by Next.js runtime bootstrapping and/or third‑party SDKs.

Additionally, hand-rolled CSP does not track Clerk/Stripe’s evolving domain requirements.

## Fix

1. **Stop emitting CSP from `next.config.ts`.** Keep non-CSP security headers there (nosniff, referrer policy, etc.).
2. **Delegate CSP header generation to Clerk middleware** in `proxy.ts` using `contentSecurityPolicy` options:
   - Clerk provides a Clerk + Stripe compatible baseline CSP (including `worker-src blob:`).
   - We merge in stricter app directives (`base-uri`, `frame-ancestors`, `object-src`, expanded `img-src`, etc.).
3. Add a unit test to ensure `proxy.ts` configures `clerkMiddleware()` with CSP options (prevents accidental regression).

**Why this approach:** Clerk’s middleware owns the integration surface for Clerk + Stripe and can evolve the required CSP sources without us hand-maintaining lists.

## Verification

- [x] Unit test added to assert CSP options are passed to Clerk middleware
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm test --run`
- [x] `pnpm build`
- [ ] Preview deployment loads without CSP console errors causing a blank page

## Related

- `proxy.ts` — Clerk middleware entrypoint (Next.js “Proxy” middleware)
- `next.config.ts` — Static headers configuration (CSP removed)
- Clerk CSP docs: https://clerk.com/docs/guides/secure/best-practices/csp-headers
- Next.js CSP guide: https://nextjs.org/docs/app/guides/content-security-policy
