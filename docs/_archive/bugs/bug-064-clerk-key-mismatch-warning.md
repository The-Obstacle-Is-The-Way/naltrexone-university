# BUG-064: Clerk Key Mismatch Warning in Dev Server

**Status:** Won't Fix
**Priority:** P4
**Date:** 2026-02-05
**Resolution:** 2026-02-05 - False alarm. Keys verified correct. Warning is transient/cosmetic.

---

## Description

The Next.js dev server logs a Clerk warning about session token refresh causing an infinite redirect loop:

```
Clerk: Refreshing the session token resulted in an infinite redirect loop.
This usually means that your Clerk instance keys do not match - make sure
to copy the correct publishable and secret keys from the Clerk dashboard.
```

This warning appears during normal page loads and may cause authentication issues.

**Potential Impact:**
- May cause session authentication failures
- Could be related to BUG-062 (practice sessions not working)
- May affect any authenticated server actions

---

## Steps to Reproduce

1. Start dev server (`pnpm dev`)
2. Navigate to any page
3. Check server terminal output
4. Warning appears on first page load

---

## Root Cause

The Clerk publishable key (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) and/or secret key (`CLERK_SECRET_KEY`) in `.env.local` may not match the keys in the Clerk dashboard.

Possible causes:
1. Keys copied from wrong Clerk instance (dev vs prod)
2. Keys regenerated in Clerk dashboard but not updated locally
3. Instance was switched between development/production mode

---

## Fix

1. Go to [Clerk Dashboard](https://dashboard.clerk.com/)
2. Select the correct instance (development)
3. Navigate to "API Keys"
4. Copy both keys:
   - Publishable key → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - Secret key → `CLERK_SECRET_KEY`
5. Update `.env.local` with fresh keys
6. Restart dev server

---

## Verification

- [ ] Fresh keys copied from Clerk dashboard
- [ ] `.env.local` updated with new keys
- [ ] Dev server restarted
- [ ] Warning no longer appears in server logs
- [ ] Sign-in/sign-up flows work correctly
- [ ] Authenticated pages load without redirect loops

---

## Related

- BUG-062: Practice Session Modes Not Working (may be caused by auth issues)
- BUG-040 (archived): Clerk Infinite Redirect Loop Warning (similar issue, previously resolved)
- Clerk documentation: https://clerk.com/docs/troubleshooting/infinite-redirect-loop
