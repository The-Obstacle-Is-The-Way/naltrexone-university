# BUG-093: Hard-Coded Route in Practice View Navigation

**Status:** Reclassified
**Priority:** P4
**Date:** 2026-02-07

---

## Description

This item captured one concrete instance of hard-coded route usage in `PracticeView`.

## Root Cause

The single-instance report was valid, but redundant with broader sweep item `BUG-097` (codebase-wide hard-coded routes).

## Impact

Narrow issue; fully subsumed by larger routing consistency fix.

## Resolution

Reclassified as duplicate of `BUG-097` and closed under that umbrella fix.

`PracticeView` now uses `ROUTES.APP_DASHBOARD`.

- `app/(app)/app/practice/components/practice-view.tsx`

## Verification

- [x] `PracticeView` no longer hard-codes dashboard path
- [x] Route constant sweep completed under `BUG-097`
- [x] Full regression suite passed (`pnpm typecheck && pnpm lint && pnpm test --run`)

## Related

- `docs/_archive/bugs/bug-097-widespread-hard-coded-route-strings.md`
- `lib/routes.ts`
