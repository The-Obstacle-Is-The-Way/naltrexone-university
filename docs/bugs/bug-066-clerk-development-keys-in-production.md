# BUG-066: Clerk Development Keys Used in Production

**Status:** Blocked - Manual Action Required
**Priority:** P1
**Date:** 2026-02-05

---

## Description

The production site (addictionboards.com) is using Clerk development keys instead of production keys. This causes:

1. Console warning: "Clerk has been loaded with development keys"
2. Visible "Development mode" badge on the sign-in widget
3. Strict usage limits that could affect real users
4. Unprofessional appearance

**Observed:**
- Sign-in page shows orange "Development mode" badge at bottom of Clerk widget
- Browser console shows: `Clerk: Clerk has been loaded with development keys. Development instances have strict usage limits and should not be used when deploying your application to production.`

**Expected:**
- Production keys should be used on production deployment
- No "Development mode" badge visible
- No console warnings about development keys

---

## Steps to Reproduce

1. Navigate to https://addictionboards.com/sign-in
2. Open browser DevTools → Console
3. Observe warning about development keys
4. Observe "Development mode" badge at bottom of sign-in widget

---

## Root Cause

Vercel environment variables for Clerk are set to development keys instead of production keys, OR the production Clerk instance hasn't been configured.

**Files involved:**
- Vercel dashboard → Environment Variables (Production scope)
- `.env.local` (if deploying from local)

---

## Fix

This cannot be fixed in-repo. It requires updating the deployed environment configuration.

1. In Clerk dashboard, ensure you have a **Production** instance (not just Development).
2. Copy the production publishable key and secret key from Clerk.
3. In Vercel → Project → Settings → Environment Variables, update **Production** values:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → production key (starts with `pk_live_`)
   - `CLERK_SECRET_KEY` → production key (starts with `sk_live_`)
4. If you use Clerk webhooks in production, confirm the webhook signing secret matches the production instance.
5. Redeploy the application (trigger a production deployment).

**Important:** Development keys start with `pk_test_` / `sk_test_`, production keys start with `pk_live_` / `sk_live_`.

---

## Verification

- [ ] Production sign-in page shows no "Development mode" badge
- [ ] Console has no Clerk development key warnings
- [ ] Authentication still works correctly in production
- [ ] Production Clerk webhooks still function (if configured)

---

## Related

- BUG-064: Clerk Key Mismatch Warning (different issue, same system)
- Clerk docs: https://clerk.com/docs/deployments/overview

---

## Screenshot

Sign-in widget showing "Development mode" badge at bottom.
