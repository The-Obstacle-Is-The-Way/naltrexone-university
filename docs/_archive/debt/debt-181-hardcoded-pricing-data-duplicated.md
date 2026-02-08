# DEBT-181: Hardcoded Pricing Data Duplicated in Marketing and Pricing Views

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

Pricing data is hardcoded in two separate files:

1. `components/marketing/marketing-home.tsx` (lines ~214-254) — monthly `$29`, annual `$199`, "Save $149 per year", feature bullet points
2. `app/pricing/pricing-view.tsx` (lines ~132-182) — same prices, same savings text, same feature list

Both files independently define the same `$29`, `$199`, `Save $149 per year` strings and the same feature descriptions (`Access to all questions`, `Detailed explanations`, `Progress tracking`).

## Impact

- When prices change, both files must be updated — easy to miss one.
- Feature list drift between marketing and pricing pages creates user confusion.
- Violates DRY principle.

## Resolution

1. Added shared pricing constants in `lib/pricing-data.ts` (`PRICING_DATA`).
2. Updated both consumers to use shared data:
   - `components/marketing/marketing-home.tsx`
   - `app/pricing/pricing-view.tsx`
3. Added regression tests to prevent reintroducing inline duplicated literals:
   - `components/marketing/marketing-home.test.tsx`
   - `app/pricing/page.test.tsx`

## Verification

- [x] Pricing data defined in exactly one place
- [x] Both marketing home and pricing page render correct prices
- [x] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` passes

## Related

- `components/marketing/marketing-home.tsx`
- `app/pricing/pricing-view.tsx`
- Frontend tracker: FE-041
