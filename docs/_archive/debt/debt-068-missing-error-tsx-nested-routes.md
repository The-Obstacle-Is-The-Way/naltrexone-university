# DEBT-068: Missing error.tsx in Nested Routes

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

Key nested routes previously lacked route-scoped `error.tsx` boundaries, causing fallbacks to the root error page and losing context for recovery.

## Resolution

Added nested route error boundaries:

- `app/(app)/app/dashboard/error.tsx`
- `app/(app)/app/practice/error.tsx`
- `app/(app)/app/billing/error.tsx`

These provide contextual messaging while still supporting reset/retry behavior.

## Verification

- [x] Files exist for each listed route.
- [x] Unit tests and typecheck pass.

## Related

- `app/error.tsx`
- `app/global-error.tsx`
