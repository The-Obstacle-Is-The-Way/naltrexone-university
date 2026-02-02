# DEBT-067: Generic Error Page Lacks Error Details

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

The app-level error UI needs to give users actionable next steps, while exposing only safe information for support/debugging.

## Resolution

`app/error.tsx` and `app/global-error.tsx` now:

- Provide guidance (“Please try again… contact support and share the error ID”)
- Display Next.js `error.digest` when available (safe identifier)
- Use accessible, focus-visible buttons via the shared `Button` component

## Verification

- [x] Manual check: error pages show an error ID when provided.
- [x] Unit tests and typecheck pass.

## Related

- `app/error.tsx`
- `app/global-error.tsx`
