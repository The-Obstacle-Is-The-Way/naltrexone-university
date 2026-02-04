# DEBT-098: Clerk UI Components Not Fully Themed for Achromatic Dark Mode

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-04
**Archived:** 2026-02-04

---

## Description

Clerk UI components (SignIn/SignUp/UserButton/etc.) were inconsistently themed: SignIn/SignUp relied on per-page `appearance` overrides, while other Clerk touchpoints could render with Clerk defaults.

## Fix

- Installed `@clerk/themes`.
- `components/providers.tsx`: Added a global `appearance` to `<ClerkProvider>` (`baseTheme: dark` + achromatic variables).
- `app/sign-in/[[...sign-in]]/page.tsx` and `app/sign-up/[[...sign-up]]/page.tsx`: Removed per-page `appearance` overrides to avoid drift.

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --run`
- `pnpm build`

## Remaining (external)

Clerk-hosted OAuth consent/branding screens are configured in the Clerk Dashboard (outside this repo).
