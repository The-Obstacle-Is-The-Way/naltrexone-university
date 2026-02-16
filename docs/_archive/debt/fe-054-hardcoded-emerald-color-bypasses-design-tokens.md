# FE-054: Hardcoded `text-emerald-500` Bypasses Design System Tokens

**Priority:** P3
**Status:** Resolved
**Found:** 2026-02-16
**Resolved:** 2026-02-16
**Component:** Frontend — CSS/Tailwind Design System

---

## Summary

Three production files previously used `text-emerald-500` (a raw Tailwind color) instead of the `text-success` design token. This bypassed the theming system and wouldn’t adapt to dark mode or custom theme overrides.

## Resolution

Replaced `text-emerald-500` with the semantic `text-success` token in:

- `app/(app)/app/shared/components/session-breakdown-list.tsx:49`
- `app/(app)/app/history/components/history-questions-tab.tsx:38`
- `app/(app)/app/dashboard/page.tsx:192`

Updated the regression test:

- `app/(app)/app/shared/components/session-breakdown-list.test.tsx:130` — now asserts `text-success`

## Design System Context

The codebase has a `success` token defined in the theme:
- Button variant: `bg-success text-success-foreground` (in `components/ui/button.tsx:17`)
- Destructive counterpart: `text-destructive` is used consistently across the codebase

The `text-emerald-500` usage originated from BS-005 (practice recent sessions brainstorming) and was never migrated to the design token system.

## Acceptance Criteria

- [x] All 3 production files use `text-success` instead of `text-emerald-500`
- [x] Test assertion updated to match new class
- [ ] Visual appearance verified in both light and dark modes (manual spot-check)

---

## Related

- `components/ui/button.tsx:17` — `success` variant definition
- `app/globals.css` — CSS custom property definitions for success color
