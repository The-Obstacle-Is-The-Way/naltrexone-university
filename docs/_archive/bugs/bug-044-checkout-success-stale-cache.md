# BUG-044: Checkout Success Page Serving Stale Code

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02

---

## Summary

After fixing BUG-039 (searchParams not awaited), the checkout success page continues to throw the same error in development. The error message references line numbers from the OLD code, suggesting the dev server is serving stale compiled code.

## Observed Error

```
Error: Route "/checkout/success" used `searchParams.session_id`.
`searchParams` is a Promise and must be unwrapped with `await` or `React.use()` before accessing its properties.
    at CheckoutSuccessPage (app/(marketing)/checkout/success/page.tsx:172:55)
  170 |   searchParams: { session_id?: string };
  171 | }) {
> 172 |   await syncCheckoutSuccess({ sessionId: searchParams.session_id ?? null });
```

## Evidence of Stale Code

The current file (`app/(marketing)/checkout/success/page.tsx`) shows:
- Line 172 is inside a helper function, NOT the main component
- Lines 328-334 correctly type `searchParams` as `Promise<CheckoutSuccessSearchParams>`
- The fix from BUG-039 (commit `90054bc`) IS present in the source

The error message references code that no longer exists at those line numbers.

## Root Cause (Suspected)

Next.js Turbopack dev server caching issue. The compiled output in `.next/` doesn't match the source files.

## Resolution

Restart dev server with cache clear:

```bash
# Kill dev server (Ctrl+C or find process)
rm -rf .next
pnpm dev
```

## Verification

- [ ] After cache clear, checkout flow completes without searchParams error
- [ ] Error message no longer references old line numbers

## Related

- BUG-039: Original searchParams fix (archived)
- Commit `90054bc`: Fix BUG-039: await checkout success searchParams
