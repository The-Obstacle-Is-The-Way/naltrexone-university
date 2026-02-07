# DEBT-130: Missing Suspense Boundary in App Layout

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-06
**Resolved:** 2026-02-07

---

## Description

The app layout at `app/(app)/app/layout.tsx` renders `{children}` without a `<Suspense>` fallback. Currently mitigated by individual `loading.tsx` files in each route segment, but if a new route is added without one, users see an unhandled Suspense error.

## Impact

- New routes without `loading.tsx` cause Suspense boundary errors
- Defensive Suspense in layout provides a safety net

## Resolution

Wrap `{children}` in a Suspense boundary with a minimal loading fallback.

## Verification

- [x] Layout has Suspense boundary around children (`app/(app)/app/layout.tsx`)
- [x] Suspense fallback is covered by test (`app/(app)/app/layout-shell.test.tsx`)
- [x] All existing pages/tests render correctly (`pnpm typecheck && pnpm lint && pnpm test --run`)

## Related

- `app/(app)/app/layout.tsx`
