# DEBT-065: Touch Targets Too Small

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

Some dropdown menu items had small hit targets, making them harder to tap accurately on mobile.

The pricing subscribe buttons were initially suspected to be below 44px, but with Tailwind `text-sm` (20px line-height) + `py-3` (24px total vertical padding), they already render at ~44px total height and do not require changes.

## Resolution

- Enforced a minimum 44px height on dropdown menu interactive items via `min-h-[44px]`:
  - `DropdownMenuItem`
  - `DropdownMenuCheckboxItem`
  - `DropdownMenuRadioItem`
  - `DropdownMenuSubTrigger`

## Verification

- [x] Visual inspection: dropdown menu items are easier to tap on mobile.
- [x] Existing unit tests pass.

## Related

- `components/ui/dropdown-menu.tsx`
- `app/pricing/pricing-view.tsx` (subscribe button sizing)
