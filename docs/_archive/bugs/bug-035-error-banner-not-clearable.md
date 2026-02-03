# BUG-035: Error Banner Not Clearable on Pricing Page

**Status:** Resolved
**Priority:** P3 - Low
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary

After a checkout error redirects to `/pricing?checkout=error`, the error banner displays but users have no way to dismiss it without manually editing the URL.

## Location

- `app/pricing/page.tsx`
- `app/pricing/pricing-view.tsx`

## Root Cause

The banner was controlled entirely by URL query parameter with no dismiss mechanism.

## Fix

Added a clear, explicit dismissal mechanism that removes the query param:

- Render a dismiss link (`href="/pricing"`, `aria-label="Dismiss"`) whenever a banner is present.
- Clicking the link navigates to `/pricing` without `?checkout=...`, so the banner disappears without the user editing the URL manually.

## Verification

- [x] Unit tests added (`page.test.tsx`)
  - Renders dismiss link when banner is present
  - Does not render dismiss link when banner is null
- [x] TypeScript compilation passes
- [x] Build succeeds
- [x] Manual test: Click × link, URL clears and banner disappears

## Related

- BUG-036: No loading state on subscribe buttons
