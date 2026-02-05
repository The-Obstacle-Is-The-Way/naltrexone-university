# BUG-067: Clerk Sign-in Shows "NTX University" Instead of "Addiction Boards"

**Status:** Open
**Priority:** P3
**Date:** 2026-02-05

---

## Description

The Clerk sign-in widget displays "Sign in to NTX University" instead of the correct application name "Addiction Boards" (or "Naltrexone University").

"NTX University" appears to be a truncated or abbreviated version that was never updated in Clerk settings.

**Observed:**
- Sign-in page header: "Sign in to NTX University"
- Welcome text: "Welcome back! Please sign in to continue"

**Expected:**
- Sign-in page header: "Sign in to Addiction Boards"
- Consistent branding throughout

---

## Steps to Reproduce

1. Navigate to https://addictionboards.com/sign-in
2. Observe the sign-in widget header text

---

## Root Cause

The application name in Clerk dashboard is set to "NTX University" instead of the correct name.

---

## Fix

1. Go to Clerk Dashboard → Settings → General
2. Update "Application name" to "Addiction Boards"
3. Save changes
4. No code changes or redeployment needed (Clerk updates dynamically)

---

## Verification

- [ ] Sign-in page shows "Sign in to Addiction Boards"
- [ ] Sign-up page shows correct name
- [ ] Any Clerk emails use correct name

---

## Related

- BUG-066: Clerk Development Keys in Production
