# DEBT-182: Missing `font-heading` on Error Boundary, Not-Found, and Pricing Headings

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

All app page headings consistently use `font-heading` (dashboard, bookmarks, billing, review, practice, exam-review, session-summary), but several files omit it:

1. **`app/not-found.tsx` (line 19):** `<h1 className="text-4xl font-bold tracking-tight text-foreground">` — missing `font-heading`
2. **`app/pricing/pricing-view.tsx` (line 41):** `<h1 className="text-4xl font-bold tracking-tight text-foreground">` — missing `font-heading`
3. **`app/global-error.tsx` (line ~24):** Error heading missing `font-heading`
4. **All 9 `error.tsx` files:** Use `text-xl font-semibold` without `font-heading` on their `<h2>` elements

This creates inconsistent typographic hierarchy across the app.

## Impact

- Visual inconsistency — headings on error/not-found/pricing pages use a different font than all other pages.
- When `font-heading` maps to a custom font family, these pages will look out of place.

## Resolution

1. Add `font-heading` to the `<h1>` in `app/not-found.tsx` and `app/pricing/pricing-view.tsx`.
2. Add `font-heading` to the heading in `app/global-error.tsx`.
3. Add `font-heading` to the `<h2>` in all 9 `error.tsx` files.
4. Added regression coverage:
   - `app/not-found.test.tsx`
   - `app/pricing/page.test.tsx`
   - `app/error-heading-styles.test.tsx`

## Verification

- [x] `not-found.tsx` h1 includes `font-heading`
- [x] `pricing-view.tsx` h1 includes `font-heading`
- [x] `global-error.tsx` heading includes `font-heading`
- [x] Error boundary headings include `font-heading`
- [x] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` passes

## Related

- `app/not-found.tsx`
- `app/pricing/pricing-view.tsx`
- `app/global-error.tsx`
- All `error.tsx` files
- FE-015 (error boundary extraction — font-heading can be baked into the shared component)
- Frontend tracker: FE-042
