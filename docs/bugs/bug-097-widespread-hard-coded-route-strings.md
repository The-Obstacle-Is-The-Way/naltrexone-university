# BUG-097: Widespread Hard-Coded Route Strings Across Codebase

**Status:** Open
**Priority:** P4
**Date:** 2026-02-07

---

## Description

While BUG-093 identified a single hard-coded route in `practice-view.tsx`, a codebase-wide tracer bullet audit revealed **40+ hard-coded route strings across 15+ files**. Every route constant defined in `lib/routes.ts` has duplicates scattered through components, layouts, and server actions. Additionally, `/sign-in` and `/sign-up` are used in multiple places but have no corresponding ROUTES constant at all.

## Root Cause

`lib/routes.ts` defines:

```typescript
export const ROUTES = {
  HOME: '/',
  PRICING: '/pricing',
  CHECKOUT_SUCCESS: '/checkout/success',
  APP_DASHBOARD: '/app/dashboard',
  APP_PRACTICE: '/app/practice',
  APP_REVIEW: '/app/review',
  APP_BOOKMARKS: '/app/bookmarks',
  APP_BILLING: '/app/billing',
} as const;
```

But these constants are rarely imported. Instead, route strings are hard-coded throughout:

### `/app/dashboard` — 10 instances
- `components/providers.tsx:38-39` (Clerk redirect URLs)
- `components/get-started-cta.tsx:55` (conditional Link)
- `components/auth-nav.tsx:72` (conditional Link)
- `components/app-nav-items.ts:7` (navigation config)
- `app/(app)/app/layout.tsx:65` (logo Link)
- `app/pricing/pricing-view.tsx:89` (Link)
- `app/(app)/app/practice/components/practice-view.tsx:73` (BUG-093)
- `app/(app)/app/questions/[slug]/question-page-client.tsx:50` (Link)
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:110` (Link)

### `/app/practice` — 9 instances
- `components/app-nav-items.ts:8`
- `app/(app)/app/review/page.tsx:65,206`
- `app/(app)/app/dashboard/page.tsx:129,227`
- `app/(app)/app/bookmarks/page.tsx:89,192`
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:113`

### `/pricing` — 17+ instances
- `components/get-started-cta.tsx:35,45,55`
- `components/auth-nav.tsx:42,73`
- `components/marketing/marketing-home.tsx:78,111,225,250,271,300`
- `app/(app)/app/layout.tsx:44`
- `app/pricing/pricing-view.tsx:69`
- `app/pricing/subscribe-action.ts:35,39,52`
- `app/pricing/manage-billing-action.ts:17`

### `/sign-in` and `/sign-up` — No ROUTES constant defined
- `components/auth-nav.tsx:48` (`/sign-in`)
- `components/marketing/marketing-home.tsx:273,308,311` (`/sign-in`, `/sign-up`)
- `app/pricing/subscribe-action.ts:31` (`/sign-up`)
- `app/pricing/manage-billing-action.ts:14` (`/sign-up`)

## Impact

- If any route changes in `lib/routes.ts`, 40+ locations silently break (404s)
- `ROUTES` constants exist but are effectively unused — misleading
- `/sign-in` and `/sign-up` have no constant at all
- Refactoring routes requires a codebase-wide search-and-replace
- No runtime issue today (all routes are correct)

## Proposed Fix

1. Add missing constants to `lib/routes.ts`:
   ```typescript
   SIGN_IN: '/sign-in',
   SIGN_UP: '/sign-up',
   ```

2. Replace all hard-coded route strings with `ROUTES.*` constants across all files

3. Consider adding a lint rule or Biome check to prevent future hard-coded route strings

## Verification

- [ ] All route strings use `ROUTES.*` constants
- [ ] `lib/routes.ts` includes `/sign-in` and `/sign-up`
- [ ] No hard-coded route strings remain (excluding test files)
- [ ] Navigation still works correctly throughout the app
- [ ] `pnpm typecheck` passes

## Related

- BUG-093 (single instance — practice-view.tsx hard-coded route)
- `lib/routes.ts`
- SPEC-020 Phase 1 (component decomposition may touch affected files)
