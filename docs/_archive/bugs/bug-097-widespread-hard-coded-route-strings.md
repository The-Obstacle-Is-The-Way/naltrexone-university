# BUG-097: Widespread Hard-Coded Route Strings Across Codebase

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-07

---

## Description

Route literals were duplicated across app/components, bypassing `lib/routes.ts` constants.

## Root Cause

Routes were hard-coded in multiple UI and server-action files. `SIGN_IN` and `SIGN_UP` constants were also missing from `ROUTES`.

## Impact

Route changes required broad manual edits and increased risk of drift/404 regressions.

## Fix

Completed route-constant sweep:

- Added `ROUTES.SIGN_IN` and `ROUTES.SIGN_UP`
- Replaced route literals with `ROUTES.*` / `toPracticeSessionRoute(...)` across affected app/component/action files
- Covered updated UI paths in existing tests and browser specs

Primary files:

- `lib/routes.ts`
- `components/providers.tsx`
- `components/app-nav-items.ts`
- `components/auth-nav.tsx`
- `components/get-started-cta.tsx`
- `components/marketing/marketing-home.tsx`
- `app/(app)/app/layout.tsx`
- `app/(app)/app/dashboard/page.tsx`
- `app/(app)/app/review/page.tsx`
- `app/(app)/app/bookmarks/page.tsx`
- `app/(app)/app/practice/practice-page-session-start.ts`
- `app/pricing/subscribe-action.ts`
- `app/pricing/manage-billing-action.ts`
- `app/pricing/pricing-view.tsx`

## Verification

- [x] Added sign-in/sign-up route constants in `lib/routes.ts`
- [x] Replaced hard-coded app/pricing/auth route strings in production code
- [x] `rg` audit shows route literals only in `lib/routes.ts` definitions (plus test assertions)
- [x] Full regression suite passed (`pnpm typecheck && pnpm lint && pnpm test --run`)

## Related

- `docs/_archive/bugs/bug-093-hard-coded-route-practice-view-navigation.md`
- `lib/routes.ts`
