# DEBT-130: Missing Suspense Boundary in App Layout

**Status:** Open
**Priority:** P3
**Date:** 2026-02-06

---

## Description

The app layout at `app/(app)/app/layout.tsx` renders `{children}` without a `<Suspense>` fallback. Currently mitigated by individual `loading.tsx` files in each route segment, but if a new route is added without one, users see an unhandled Suspense error.

## Impact

- New routes without `loading.tsx` cause Suspense boundary errors
- Defensive Suspense in layout provides a safety net

## Resolution

Wrap `{children}` in a Suspense boundary with a minimal loading fallback.

## Verification

- [ ] Layout has Suspense boundary around children
- [ ] All existing pages render correctly

## Related

- `app/(app)/app/layout.tsx`
