# BUG-222: Pricing Page Ignores Repeated `checkout` / `reason` Query Params

**Status:** Resolved
**Priority:** P4
**Date:** 2026-03-15
**Resolved:** 2026-03-15 (PR #219)

## Summary

The pricing page originally assumed scalar `checkout` and `reason` query params. When Next.js provided `string[]` for repeated params, banner selection and the manage-billing CTA both failed closed.

## Impact

- Checkout cancel/error/rate-limit banners can disappear.
- `reason=manage_billing` and `reason=payment_processing` can stop rendering the billing-management CTA.
- The page still loads, but the recovery guidance that the redirect was supposed to convey is silently lost.

## Root Cause

1. `app/pricing/page.tsx:71-74` previously modeled `checkout` and `reason` as scalar strings even though Next.js can supply `string[]` for repeated query params.
2. `app/pricing/page.tsx:77-126` previously compared `searchParams.checkout` and `searchParams.reason` directly with string literals inside `getPricingBanner(...)`, so runtime arrays silently missed every banner branch.
3. `app/pricing/page.tsx:138-149` previously computed `effectiveReason` from `resolvedSearchParams.reason ?? pricingData.reason ?? undefined`. A runtime `string[]` is truthy, so it suppressed the fallback entitlement reason while still failing the later `=== 'manage_billing'` and `=== 'payment_processing'` checks.
4. The repo already had the correct boundary-normalization pattern in `lib/search-params.ts` and `app/(app)/app/history/history-search-params.ts`, but pricing had drifted from that standard.

## Resolution

Fixed with strict TDD:

1. Added failing regressions in `app/pricing/page.test.tsx` for array-valued `checkout` and `reason` inputs, including full-page rendering coverage for the manage-billing CTA path.
2. Widened `PricingSearchParams` to accept `string | string[] | undefined` for `checkout` and `reason`.
3. Reused the existing canonical helper `normalizeSearchParam(...)` from `lib/search-params.ts` instead of introducing new ad hoc logic.
4. Normalized `checkout` and `reason` exactly once at the top of `getPricingBanner(...)`.
5. Normalized `resolvedSearchParams.reason` at the page boundary before computing `effectiveReason`, so downstream CTA and fallback logic keeps operating on plain strings.
6. Left all downstream comparisons unchanged, preserving existing behavior for scalar params while making repeated params deterministic by taking the first value.

## Verification

- [x] `app/pricing/page.test.tsx` covers repeated `checkout` arrays for `error` and `rate_limited`.
- [x] `app/pricing/page.test.tsx` covers repeated `reason` arrays for `manage_billing` and `payment_processing`.
- [x] `app/pricing/page.test.tsx` verifies the full `PricingPage` render path still shows `Manage Billing` when `searchParams.reason` is `['manage_billing', 'subscription_required']`.
- [x] Local verification passed on the implementation branch: `pnpm test --run app/pricing/page.test.tsx`.
- [x] Local verification passed on the implementation branch: `pnpm typecheck`.
- [x] PR #219 received a fresh `coderabbitai` approval with no actionable review comments and green CI/status checks before archival.
