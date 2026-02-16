# FE-054: Hardcoded `text-emerald-500` Bypasses Design System Tokens

**Priority:** P3
**Status:** Open
**Found:** 2026-02-16
**Component:** Frontend — CSS/Tailwind Design System

---

## Summary

Three production files use `text-emerald-500` (a raw Tailwind color) instead of the `text-success` design token. This bypasses the theming system and won't adapt to dark mode or custom theme overrides.

## Affected Files

| File | Line | Usage |
|------|------|-------|
| `app/(app)/app/shared/components/session-breakdown-list.tsx` | 49 | `<span className="text-emerald-500">Correct</span>` |
| `app/(app)/app/history/components/history-questions-tab.tsx` | 38 | `<span className="text-emerald-500">Correct</span>` |
| `app/(app)/app/dashboard/page.tsx` | 188 | `'text-emerald-500'` (conditional class) |

## Design System Context

The codebase has a `success` token defined in the theme:
- Button variant: `bg-success text-success-foreground` (in `components/ui/button.tsx:17`)
- Destructive counterpart: `text-destructive` is used consistently across the codebase

The `text-emerald-500` usage originated from BS-005 (practice recent sessions brainstorming) and was never migrated to the design token system.

## Test Impact

One test asserts the raw color class:
- `app/(app)/app/shared/components/session-breakdown-list.test.tsx:130` — `expect(...).toContain('text-emerald-500')`

This test must be updated to assert `text-success` instead.

## Suggested Fix

Replace all `text-emerald-500` occurrences with `text-success` and update the test assertion.

## Acceptance Criteria

- [ ] All 3 production files use `text-success` instead of `text-emerald-500`
- [ ] Test assertion updated to match new class
- [ ] Visual appearance verified in both light and dark modes

---

## Related

- `components/ui/button.tsx:17` — `success` variant definition
- `app/globals.css` — CSS custom property definitions for success color
