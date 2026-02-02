# BUG-040: Clerk Infinite Redirect Loop Warning (Key Mismatch)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary

The app intermittently logged Clerk’s “Refreshing the session token resulted in an infinite redirect loop” warning. This is commonly caused by mismatched Clerk publishable/secret keys (wrong environment or wrong Clerk instance).

## Root Cause

We did not validate that `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` were a compatible pair when Clerk was enabled (`NEXT_PUBLIC_SKIP_CLERK !== 'true'`). Mispaired keys can lead to runtime redirect loops during session token refresh.

## Fix

Added defensive validation in `lib/env.ts` when Clerk is enabled:

- Reject `pk_test_…` + `sk_live_…` (and vice versa) mismatches
- When both keys include a decodable instance slug, reject mismatched instance slugs

This fails fast at startup with an `Invalid environment variables` error instead of producing intermittent auth redirect loops.

## Verification

- [x] Unit tests added: `lib/env.test.ts`
- [ ] Manual: set mispaired keys locally and confirm the app refuses to boot with a clear console error

## Related

- `lib/env.ts` — environment validation
- `proxy.ts` — Clerk middleware
