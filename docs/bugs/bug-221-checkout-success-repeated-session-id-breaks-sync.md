# BUG-221: Checkout Success Rejects Repeated `session_id` Query Params

**Status:** Open
**Priority:** P3
**Date:** 2026-03-15

## Summary

`/checkout/success` still models `searchParams.session_id` as a scalar string. When Next.js provides `string[]` for repeated `session_id` params, the array is forwarded unchanged into `syncCheckoutSuccess(...)`, fails the non-empty-string assertion, and redirects the user to the generic checkout error page instead of completing eager subscription sync.

## Impact

- A successful Stripe return can degrade into `/pricing?checkout=error` if the success URL contains duplicated `session_id` params.
- The eager post-checkout subscription sync is skipped on this path, so access can appear broken until webhook catch-up.
- This is a post-purchase failure path, not just a cosmetic banner issue.

## Verification Notes

1. `app/(marketing)/checkout/success/page.tsx:23-28` types `searchParams` as `Promise<{ session_id?: string }>` instead of allowing `string[]`.
2. `app/(marketing)/checkout/success/checkout-success-types.ts:73-75` keeps the shared `CheckoutSuccessSearchParams` contract scalar-only.
3. `app/(marketing)/checkout/success/checkout-success-sync.tsx:269-274` forwards `resolvedSearchParams.session_id ?? null` directly into `syncCheckoutSuccess(...)` with no normalization.
4. `app/(marketing)/checkout/success/checkout-success-sync.tsx:116-120` then validates `sessionId` with `assertNonEmptyString(...)`, so any runtime `string[]` is treated as `missing_session_id`.
5. `app/(marketing)/checkout/success/checkout-success-sync.tsx:96-110` maps that validation failure to `CHECKOUT_ERROR_ROUTE`, turning a query-shape mismatch into a user-visible checkout failure.
6. Adjacent code already shows the expected normalization pattern: `app/(app)/app/billing/page.tsx:109-166` and `app/(app)/app/history/history-search-params.ts:24-80`.

## Precise TDD Fix

1. Add failing tests in `app/(marketing)/checkout/success/page.test.ts` covering `searchParams: Promise.resolve({ session_id: ['cs_a', 'cs_b'] })`.
2. Widen `CheckoutSuccessSearchParams` and the page prop to `session_id?: string | string[]`.
3. Normalize `session_id` at the page boundary before calling `syncCheckoutSuccess(...)`, using the first value consistently with the History/Billing pattern.
4. Keep the fail-closed behavior for missing or empty values after normalization; only the runtime `string[]` case should change.
