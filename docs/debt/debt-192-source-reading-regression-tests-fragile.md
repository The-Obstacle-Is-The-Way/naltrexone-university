# DEBT-192: Source-Reading Regression Tests Are Fragile

**Status:** Open
**Priority:** P3
**Date:** 2026-02-08

---

## Description

Three test files use `readFileSync` to read source code and assert on text content. This is fragile — a code comment mentioning `$29` would break the pricing test. These should be converted to behavioral assertions that verify rendered output instead.

## Affected Files

1. **`components/marketing/marketing-home.test.tsx`** — asserts source contains `from '@/lib/pricing-data'` and does not contain `$29`, `$199`, `Save $149 per year`
2. **`app/pricing/page.test.tsx`** — identical source-reading assertion for `pricing-view.tsx`
3. **`app/global-error.test.tsx`** — asserts source contains `suppressHydrationWarning`

Two other source-reading tests are **legitimate guardrails** and should be kept:
- `practice-page-logic.test.ts` — line-count cap enforcement (SPEC-020 constraint)
- `card-adoption-regression.test.ts` — Tailwind class pattern enforcement (design system guard)

## Impact

- False negatives: a comment containing `$29` would cause the pricing tests to fail even when the component correctly uses shared constants
- False positives: if pricing data is moved to a different shared module, the import path assertion breaks even though behavior is correct
- Tests assert implementation (import paths) rather than behavior (rendered output)

## Resolution

Replace each fragile source-reading test with a behavioral render test:

1. **Pricing tests (marketing-home + pricing page):** Import pricing constants from `@/lib/pricing-data`, render the component with `renderToStaticMarkup`, assert the rendered HTML contains the expected price values from the constants
2. **Global error test:** Assert that the rendered `<html>` element in the DOM includes `suppresshydrationwarning` (lowercase, as rendered by React)

## Verification

- `pnpm test --run` passes
- No `readFileSync` calls remain in the three affected test files
- The two legitimate guardrail tests (line-count, card-adoption) are unchanged

## Related

- Previously queued 6-phase prompt (Phase 2)
- FE-041 / DEBT-181 (resolved — shared pricing constants)
