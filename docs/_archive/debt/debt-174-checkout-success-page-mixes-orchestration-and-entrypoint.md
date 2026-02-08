# DEBT-174: Checkout Success Page Mixes Orchestration and Route Entrypoint

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

`app/(marketing)/checkout/success/page.tsx` is 413 lines and currently mixes:

- dependency composition (`getDeps`) and transaction wiring
- Stripe object guards/validation helpers
- retry behavior and Stripe API orchestration
- persistence/upsert behavior
- Next.js page entrypoint/redirect flow

The core sync logic (`syncCheckoutSuccess`) is correct, but it is housed directly in a route file that also exports the page entrypoint (`app/(marketing)/checkout/success/page.tsx:148`, `app/(marketing)/checkout/success/page.tsx:393`).

## Impact

- Harder to reason about route concerns versus orchestration concerns
- Slower modification velocity in payment-critical flow
- Increased risk of accidental coupling when editing page-level behavior
- Makes thin-entrypoint architecture harder to preserve

## Resolution

Extract sync orchestration into a dedicated module and keep the route thin:

1. Move checkout-success orchestration and validation helpers into an adapter/controller module.
2. Keep `page.tsx` focused on reading `searchParams` and delegating to the extracted module.
3. Preserve existing retry and validation semantics exactly; this is a structural refactor, not behavior change.

## Verification

- [x] Route file is now a thin entrypoint (`app/(marketing)/checkout/success/page.tsx`)
- [x] Orchestration logic extracted to `app/(marketing)/checkout/success/checkout-success-sync.tsx`
- [x] Extracted module has focused unit coverage (`checkout-success-sync.test.ts`)
- [x] Existing checkout success tests continue to pass (`page.test.ts`)
- [x] `pnpm typecheck && pnpm lint && pnpm test --run` passes

## Related

- `app/(marketing)/checkout/success/page.tsx`
- `docs/adr/adr-014-stripe-eager-sync.md`
