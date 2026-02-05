# BUG-066: Clerk Development Keys Used in Production

**Status:** Resolved (verification pending)
**Priority:** P1
**Date:** 2026-02-05
**Resolved:** 2026-02-05

---

## Description

The production site (addictionboards.com) was using Clerk development keys instead of production keys. This caused:

1. Console warning: "Clerk has been loaded with development keys"
2. Visible "Development mode" badge on the sign-in widget
3. Strict usage limits that could affect real users
4. Unprofessional appearance

---

## Root Cause

Vercel environment variables for Clerk were set to development keys (`pk_test_` / `sk_test_`) for ALL environments including Production. No Clerk Production instance existed.

---

## Fix

1. Created Clerk Production instance at dashboard.clerk.com
2. Obtained production keys (`pk_live_` / `sk_live_`)
3. Updated Vercel Production environment via CLI:
   ```bash
   vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production --force
   vercel env add CLERK_SECRET_KEY production --force
   ```
4. Triggered production redeploy: `vercel --prod`

---

## Verification

- [x] Production Clerk instance created with domain addictionboards.com
- [x] Vercel Production env vars updated with `pk_live_` / `sk_live_` keys
- [x] Production redeployed (dpl_2PuduKLpCbuSm1K13ExvbA2BQWTm)
- [ ] Production sign-in page shows no "Development mode" badge
- [ ] Console has no Clerk development key warnings

---

## Related

- BUG-067: Clerk Shows "NTX University" Instead of "Addiction Boards" (still needs app name change)
- Clerk docs: https://clerk.com/docs/deployments/overview
