# BUG-221: Checkout Success Rejects Repeated `session_id` Query Params

**Status:** Resolved
**Priority:** P3
**Date:** 2026-03-15
**Resolved:** 2026-03-15 (PR #217)

## Summary

`/checkout/success` originally modeled `searchParams.session_id` as a scalar string. When Next.js provided `string[]` for repeated `session_id` params, the array was forwarded unchanged into `syncCheckoutSuccess(...)`, failed the non-empty-string assertion, and redirected the user to the generic checkout error page instead of completing eager subscription sync.

## Impact

- A successful Stripe return can degrade into `/pricing?checkout=error` if the success URL contains duplicated `session_id` params.
- The eager post-checkout subscription sync is skipped on this path, so access can appear broken until webhook catch-up.
- This is a post-purchase failure path, not just a cosmetic banner issue.

## Root Cause

1. `app/(marketing)/checkout/success/page.tsx:23-28` types `searchParams` as `Promise<{ session_id?: string }>` instead of allowing `string[]`.
2. `app/(marketing)/checkout/success/checkout-success-types.ts:73-75` keeps the shared `CheckoutSuccessSearchParams` contract scalar-only.
3. `app/(marketing)/checkout/success/checkout-success-sync.tsx:269-274` forwards `resolvedSearchParams.session_id ?? null` directly into `syncCheckoutSuccess(...)` with no normalization.
4. `app/(marketing)/checkout/success/checkout-success-sync.tsx:116-120` then validates `sessionId` with `assertNonEmptyString(...)`, so any runtime `string[]` is treated as `missing_session_id`.
5. `app/(marketing)/checkout/success/checkout-success-sync.tsx:96-110` maps that validation failure to `CHECKOUT_ERROR_ROUTE`, turning a query-shape mismatch into a user-visible checkout failure.
6. Adjacent code already shows the expected normalization pattern: `app/(app)/app/billing/page.tsx:109-166` and `app/(app)/app/history/history-search-params.ts:24-80`.

## Resolution

Fixed with strict TDD:

1. Added `lib/search-params.test.ts` first and extracted shared `normalizeSearchParam(value: string | string[] | undefined)` into `lib/search-params.ts`.
2. Added a failing checkout-success regression in `app/(marketing)/checkout/success/page.test.ts` for `searchParams: Promise.resolve({ session_id: ['cs_a', 'cs_b'] })`.
3. Widened `CheckoutSuccessSearchParams` to `session_id?: string | string[]`.
4. Normalized `session_id` at the page boundary in `app/(marketing)/checkout/success/page.tsx` before calling `syncCheckoutSuccess(...)`.
5. Refactored `app/(app)/app/history/history-search-params.ts` and `app/(app)/app/billing/page.tsx` to use the shared helper instead of local copies.
6. Preserved fail-closed behavior for missing and empty values. Only the runtime `string[]` case changed: it now uses the first value consistently.

## Verification

- [x] `lib/search-params.test.ts` covers string, string array, undefined, and empty-string inputs.
- [x] `app/(marketing)/checkout/success/page.test.ts` verifies `['cs_a', 'cs_b']` resolves to `cs_a` instead of redirecting to checkout error.
- [x] Existing Billing and History tests still pass after the shared-helper refactor.
- [x] Local coverage run shows `app/(marketing)/checkout/success/page.tsx` at 100% line coverage on the current branch.
- [x] Full gate previously passed on the implementation branch: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build`.
