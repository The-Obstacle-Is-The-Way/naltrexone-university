# DEBT-181: Hardcoded Pricing Data Duplicated in Marketing and Pricing Views

**Status:** Open
**Priority:** P2
**Date:** 2026-02-08

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

1. Create `lib/pricing-data.ts` (or `lib/constants/pricing.ts`) containing:
   ```typescript
   export const PRICING = {
     monthly: { price: '$29', period: 'month', label: 'Monthly' },
     annual: { price: '$199', period: 'year', label: 'Annual', savings: 'Save $149 per year' },
     features: [
       'Access to all questions',
       'Detailed explanations',
       'Progress tracking',
     ],
   } as const;
   ```
2. Update both `marketing-home.tsx` and `pricing-view.tsx` to import from the shared constant.
3. Keep all styling and layout in the respective components — only extract the data.

## Verification

- [ ] Pricing data defined in exactly one place
- [ ] Both marketing home and pricing page render correct prices
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` passes

## Related

- `components/marketing/marketing-home.tsx`
- `app/pricing/pricing-view.tsx`
- Frontend tracker: FE-041
