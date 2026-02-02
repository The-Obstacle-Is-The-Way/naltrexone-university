# DEBT-064: Missing Focus Indicators on Error Page Buttons

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

Keyboard users need a visible focus indicator on key actions such as “Try again” on error pages.

## Resolution

Error pages now use the shared shadcn/ui `Button` component (`components/ui/button.tsx`), which includes `focus-visible` ring/border styles.

## Verification

- [x] Visual check: focus ring is visible on error page buttons.
- [x] Unit tests and typecheck pass.

## Related

- `app/error.tsx`
- `app/global-error.tsx`
- `components/ui/button.tsx`
