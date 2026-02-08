# DEBT-175: Pricing View Bypasses Button Primitive and Skips Heading Hierarchy

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

`app/pricing/pricing-view.tsx` has two consistency gaps:

1. Uses raw `<button>` elements with duplicated utility classes instead of the shared `Button` primitive:
   - `app/pricing/pricing-view.tsx:18`
   - `app/pricing/pricing-view.tsx:65`
   - `app/pricing/pricing-view.tsx:117`
2. Heading structure jumps from page `h1` straight to plan-card `h3` without an intermediate section-level `h2`:
   - `app/pricing/pricing-view.tsx:43`
   - `app/pricing/pricing-view.tsx:129`
   - `app/pricing/pricing-view.tsx:154`

## Impact

- Duplicated interaction styling and focus-ring classes (higher drift risk)
- Weaker semantic heading outline for assistive tech and content structure
- Lower consistency with the design system conventions used elsewhere

## Resolution

1. Replace raw submit buttons with the shared `Button` component (`asChild` where needed for form semantics).
2. Introduce a section heading (`h2`) for plan cards and keep plan names at the next appropriate level.
3. Keep existing behavior unchanged (same actions, same form submissions).

## Verification

- [x] No raw `<button>` remains in `app/pricing/pricing-view.tsx`
- [x] Heading order is semantically sequential (`h1` then section `h2` then plan-level headings)
- [x] Pricing page tests remain green
- [x] `pnpm typecheck && pnpm lint && pnpm test --run` passes

## Related

- `app/pricing/pricing-view.tsx`
- `app/pricing/page.test.tsx`
