# BUG-090: Practice Error State Has No Escape Hatch

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-07

---

## Description

When practice question loading failed, users only had a `Try again` action and no explicit path to safely leave the error state.

## Root Cause

`PracticeView` rendered only retry affordance in the error branch, with no navigation fallback.

- `app/(app)/app/practice/components/practice-view.tsx` (pre-fix)

## Impact

Users could remain stuck retrying in degraded network/server conditions, with no explicit in-UI escape path.

## Fix

Added a second action in the practice error card:

- `Try again` (existing behavior)
- `Return to dashboard` (new escape hatch)

Implementation and coverage:

- `app/(app)/app/practice/components/practice-view.tsx`
- `app/(app)/app/practice/components/practice-view.browser.spec.tsx`

## Verification

- [x] Error state now shows both retry and escape-hatch actions
- [x] Escape hatch links to `ROUTES.APP_DASHBOARD`
- [x] Browser spec asserts the new link is rendered
- [x] Full regression suite passed (`pnpm typecheck && pnpm lint && pnpm test --run`)

## Related

- `app/(app)/app/practice/components/practice-view.tsx`
- `app/(app)/app/practice/components/practice-view.browser.spec.tsx`
