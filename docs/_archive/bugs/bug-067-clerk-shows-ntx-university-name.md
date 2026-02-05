# BUG-067: Clerk Sign-in Shows "NTX University" Instead of "Addiction Boards"

**Status:** Resolved (verification pending)
**Priority:** P3
**Date:** 2026-02-05
**Resolved:** 2026-02-05

---

## Description

The Clerk sign-in widget displayed "Sign in to NTX University" instead of "Addiction Boards".

---

## Root Cause

Application name in Clerk dashboard was set to "NTX University" (legacy name).

---

## Fix

1. Go to Clerk Dashboard → Settings → General
2. Change "Application name" to "Addiction Boards"
3. Save (updates immediately, no redeploy needed)

---

## Verification

- [x] Application renamed to "Addiction Boards" in Clerk dashboard
- [x] Both Production and Development instances show correct name
- [ ] Sign-in page shows "Sign in to Addiction Boards"

---

## Related

- BUG-066: Clerk Development Keys in Production (resolved same session)
