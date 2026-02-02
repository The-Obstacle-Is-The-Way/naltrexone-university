# BUG-040: Clerk Session Token Refresh Warning — Potential Intermittent Issue

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

The application logs intermittently show a Clerk warning about session token refresh causing redirect loops. However, subsequent testing shows the sign-in/sign-up pages ARE working correctly. This may be:
1. A transient issue during initial page load
2. Related to stale browser cookies/sessions
3. A warning that doesn't actually block functionality

**Server Log Evidence:**
```
Clerk: Refreshing the session token resulted in an infinite redirect loop.
This usually means that your Clerk instance keys do not match - make sure
to copy the correct publishable and secret keys from the Clerk dashboard.
```

**Subsequent Test Results:**
- Sign-up page loads correctly with Clerk form
- Sign-in page loads correctly with Clerk form
- Subscribe flow correctly redirects to sign-up
- Clerk "Development mode" badge shows keys are valid

## Steps to Reproduce

1. Start the dev server with `pnpm dev`
2. Navigate to any protected route (e.g., `/app/dashboard`)
3. Observe warning in server logs (intermittent)
4. Note: Sign-in page may still load correctly despite warning

## Root Cause

The `.env.local` file contains Clerk keys that don't match the Clerk instance being used. This can happen when:
1. Keys were copied from wrong Clerk project
2. Keys were regenerated in Clerk dashboard but not updated locally
3. `vercel env pull` brought down stale/wrong keys
4. Development vs production keys are mismatched

**Current Keys in `.env.local`:**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` starts with `pk_test_aW5maW5pdGUtamFndWFyLTM1...`
- Domain visible in redirect URL: `infinite-jaguar-35.accounts.dev`

## Fix

1. Go to Clerk Dashboard → API Keys
2. Verify the publishable key matches `pk_test_aW5maW5pdGUtamFndWFyLTM1...`
3. Verify the secret key matches the current `CLERK_SECRET_KEY` in `.env.local`
4. If mismatch found, copy correct keys from Clerk dashboard
5. Restart dev server after updating keys

**Alternative:** If keys ARE correct, the issue may be:
- Browser cookies from a different Clerk instance (clear cookies)
- Clerk SDK version mismatch (check `@clerk/nextjs` version)
- Middleware configuration issue in `proxy.ts`

## Verification

- [ ] Keys verified against Clerk dashboard
- [ ] Dev server restart after key update
- [ ] Browser cookies cleared
- [ ] Sign-in flow completes without redirect loop
- [ ] Protected routes accessible after authentication

## Impact

- **User impact:** Low to Medium — warning appears in logs but auth may still work
- **Data impact:** None
- **Workaround:** Clear browser cookies, restart dev server, try again

## Related

- Clerk docs: https://clerk.com/docs/troubleshooting/common-errors#infinite-redirect-loop
- `.env.local` file
- `proxy.ts` middleware
