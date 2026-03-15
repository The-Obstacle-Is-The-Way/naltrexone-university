# BUG-222: Pricing Page Ignores Repeated `checkout` / `reason` Query Params

**Status:** Open
**Priority:** P4
**Date:** 2026-03-15

## Summary

The pricing page still assumes scalar `checkout` and `reason` query params. If Next.js provides `string[]` for repeated params, banner selection and the manage-billing CTA both fail closed.

## Impact

- Checkout cancel/error/rate-limit banners can disappear.
- `reason=manage_billing` and `reason=payment_processing` can stop rendering the billing-management CTA.
- The page still loads, but the recovery guidance that the redirect was supposed to convey is silently lost.

## Verification Notes

1. `app/pricing/page.tsx:70-74` defines `PricingSearchParams` with scalar `checkout?: string` and `reason?: string`.
2. `app/pricing/page.tsx:76-122` branches on strict string equality inside `getPricingBanner(...)`; runtime arrays never match any case.
3. `app/pricing/page.tsx:135-145` computes `effectiveReason` from `resolvedSearchParams.reason ?? pricingData.reason ?? undefined`. A runtime `string[]` is truthy, so it suppresses the fallback entitlement reason while also failing the later string comparisons.
4. `app/pricing/page.tsx:143-145` therefore hides `manageBillingAction` when `effectiveReason` is an array instead of `'manage_billing'` or `'payment_processing'`.
5. The repo already fixed the same family elsewhere: `app/(app)/app/billing/page.tsx:109-166` normalizes array-valued `error`, and `app/(app)/app/history/history-search-params.ts:24-80` centralizes `string | string[] | undefined` handling.

## Precise TDD Fix

1. Add failing array-input tests in `app/pricing/page.test.tsx` for repeated `checkout` and `reason` params.
2. Widen `PricingSearchParams` to accept `string | string[]`.
3. Normalize `checkout` and `reason` once at the page boundary before banner selection or CTA branching.
4. Prefer a small shared helper over re-implementing ad hoc `Array.isArray(...)` checks in multiple pages.
