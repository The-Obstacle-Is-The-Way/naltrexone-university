# BUG-219: Dead Code -- `DropdownMenu` Component and `SkipAuthGateway` Class

**Status:** Open
**Priority:** P3
**Date:** 2026-03-13

## Summary

Two modules are fully dead code -- defined and exported but never imported by any consumer:

1. **`DropdownMenu`** (`components/ui/dropdown-menu.tsx`) -- A complete Radix UI dropdown menu component with sub-components. Only its own test file imports it. No page, layout, or other component uses it.

2. **`SkipAuthGateway`** (`src/adapters/gateways/skip-auth-gateway.ts`) -- An `AuthGateway` implementation that returns a hardcoded user. Re-exported from the barrel index but never instantiated by any composition root, even for the `NEXT_PUBLIC_SKIP_CLERK=true` code path (which uses a different mechanism inside `ClerkAuthGateway`).

## Impact

- Dead code increases bundle size (DropdownMenu) and cognitive overhead.
- `SkipAuthGateway` is misleading -- developers may think it's used for local dev auth bypass when it isn't.

## Locations

- `components/ui/dropdown-menu.tsx` + `components/ui/dropdown-menu.test.tsx`
- `src/adapters/gateways/skip-auth-gateway.ts` + re-export in `src/adapters/gateways/index.ts:3`

## Suggested Fix

- If these are intentionally kept for future use, add a comment explaining the intent.
- Otherwise, remove both modules and their tests to reduce dead code.
