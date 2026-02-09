# DEBT-204: Stripe Payment Gateway Test God File (2,468 Lines)

**Status:** Open
**Priority:** P2
**Date:** 2026-02-09

---

## Description

`src/adapters/gateways/stripe-payment-gateway.test.ts` is 2,468 lines — the single largest file in the codebase and the only God file. The root cause is a ~30-line Stripe SDK mock object that is copy-pasted verbatim in every single test case (~25 times, accounting for ~625-750 lines of pure duplication).

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

Extract a `createMockStripe(overrides?)` factory function at the top of the test file (or in a shared test helper if other Stripe test files exist). The factory returns a default mock with all methods as `vi.fn()` stubs with sensible defaults. Individual tests only override the specific methods they're testing.

### Example implementation:

```typescript
function createMockStripe(overrides?: {
  customers?: Partial<typeof defaultStripe.customers>;
  checkout?: { sessions?: Partial<typeof defaultStripe.checkout.sessions> };
  billingPortal?: { sessions?: Partial<typeof defaultStripe.billingPortal.sessions> };
  webhooks?: Partial<typeof defaultStripe.webhooks>;
}) {
  return {
    customers: {
      create: vi.fn(async () => ({ id: 'cus_123' })),
      search: vi.fn(async () => ({ data: [] })),
      ...overrides?.customers,
    },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: 'cs_new', url: 'https://stripe/checkout' })),
        list: vi.fn(async () => ({ data: [] })),
        retrieve: vi.fn(async () => ({
          id: 'cs_existing',
          url: 'https://stripe/existing-checkout',
          line_items: { data: [] },
        })),
        expire: vi.fn(async () => ({
          id: 'cs_existing',
          url: 'https://stripe/existing-checkout',
        })),
        ...overrides?.checkout?.sessions,
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: 'https://stripe/portal' })),
        ...overrides?.billingPortal?.sessions,
      },
    },
    webhooks: {
      constructEvent: vi.fn(() => {
        throw new Error('unexpected webhook call');
      }),
      ...overrides?.webhooks,
    },
  } as const;
}
```

Then each test becomes:

```typescript
it('creates a Stripe customer with the correct parameters', async () => {
  const customersCreate = vi.fn(async () => ({ id: 'cus_123' }));
  const stripe = createMockStripe({ customers: { create: customersCreate } });
  // ... test logic
});
```

### Expected result:

- File shrinks from ~2,468 lines to ~800-1,000 lines (~60% reduction)
- Each test's intent becomes immediately clear from the override
- Adding new Stripe methods requires updating only the factory

## Verification

- [ ] `createMockStripe()` factory extracted at top of file
- [ ] All ~25 test cases updated to use factory with targeted overrides
- [ ] No test behavior changes — all assertions remain identical
- [ ] `pnpm test --run` passes
- [ ] `pnpm typecheck` passes
- [ ] File is under 1,200 lines

## Related

- `src/adapters/gateways/stripe-payment-gateway.test.ts` (2,468 lines)
- `src/adapters/gateways/stripe-payment-gateway.ts` (82 lines — the source is clean)
- [DEBT-092](../_archive/debt/debt-092-stripe-payment-gateway-god-class.md) — Prior God class debt (resolved by splitting into `stripe/` subdirectory)
