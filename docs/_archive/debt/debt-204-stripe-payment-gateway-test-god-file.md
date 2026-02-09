# DEBT-204: Stripe Payment Gateway Test God File (Was 2,468 Lines)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-09

---

## Description

`src/adapters/gateways/stripe-payment-gateway.test.ts` was 2,468 lines (the single largest file in the codebase). The root cause was a Stripe SDK mock object that was copy-pasted verbatim across ~25 test cases (~625-750 lines of duplication).

Each test recreates the identical mock structure:

```typescript
const stripe = {
  customers: { create: vi.fn(...), search: vi.fn(...) },
  checkout: {
    sessions: {
      create: vi.fn(...),
      list: vi.fn(...),
      retrieve: vi.fn(...),
      expire: vi.fn(...),
    },
  },
  billingPortal: { sessions: { create: vi.fn(...) } },
  webhooks: { constructEvent: vi.fn(...) },
} as const;
```

Only 1-2 methods per test need custom behavior — the rest use the same defaults every time.

## Impact

- **Readability:** 2,468 lines makes navigating test cases difficult; the actual test logic is buried under boilerplate
- **Maintainability:** If a new Stripe method is added to the gateway, all ~25 mock copies must be updated
- **DRY violation:** ~625-750 lines of pure copy-paste duplication
- **Signal-to-noise ratio:** Each test's intent (which Stripe method it's testing and how) is obscured by the identical surrounding mock setup

## Resolution

Extract shared test helpers and remove copy-pasted Stripe client mocks.

Implemented:
- `createStripeMock(withSubscriptions = false)` returns a default Stripe client mock plus the individual `vi.fn()` method mocks for per-test configuration.
- `createGateway(stripe, options?)` centralizes `StripePaymentGateway` construction with standard test deps.

### Result

- File shrank from 2,468 lines to 1,223 lines (~50% reduction).
- Tests now configure only the Stripe methods relevant to each scenario.
- Adding new Stripe methods requires updating only `createStripeMock()`.

## Verification

- [x] Shared helpers extracted at top of file
- [x] All test cases updated to use helpers
- [x] No behavior changes — assertions preserved
- [x] `pnpm test --run` passes
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] File is now 1,223 lines (still ~50% smaller)

## Related

- `src/adapters/gateways/stripe-payment-gateway.test.ts` (1,223 lines)
- `src/adapters/gateways/stripe-payment-gateway.ts` (82 lines — the source is clean)
- [DEBT-092](debt-092-stripe-payment-gateway-god-class.md) — Prior God class debt (resolved by splitting into `stripe/` subdirectory)
