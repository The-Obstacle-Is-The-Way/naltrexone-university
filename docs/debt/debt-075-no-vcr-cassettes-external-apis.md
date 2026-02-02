# DEBT-075: No VCR/Cassette Pattern for External API Testing

**Status:** Open
**Priority:** P1
**Date:** 2026-02-02

---

## Description

All Stripe and Clerk tests use inline `vi.fn()` mocks with fabricated data instead of recorded real API responses. This means:

1. **Contract changes won't be caught** — If Stripe renames `current_period_end` to `billing_period_end`, tests pass, prod fails
2. **Test data doesn't match reality** — We make up `{ id: 'cus_123' }` but real responses have dozens of fields
3. **BUG-045 was caused by this** — Stripe moved `current_period_end` to items, our mocks didn't reflect this

## Current State

```typescript
// stripe-payment-gateway.test.ts - fabricated data
const mockStripe = {
  checkout: {
    sessions: {
      create: vi.fn().mockResolvedValue({ id: 'sess_123', url: 'https://...' }),
    },
  },
};
```

## What VCR/Cassettes Would Look Like

```typescript
// Record real response once, replay in tests
import { loadCassette } from '../test-helpers/vcr';

const realStripeResponse = loadCassette('stripe/checkout-session-create.json');
// Contains actual 50+ field response from Stripe

const mockStripe = {
  checkout: {
    sessions: {
      create: vi.fn().mockResolvedValue(realStripeResponse),
    },
  },
};
```

## Resolution Options

1. **MSW (Mock Service Worker)** — HTTP-level interception, records/replays
2. **Nock** — Node.js HTTP mocking with recording mode
3. **Manual cassettes** — JSON files with real API responses, updated periodically
4. **Stripe Test Mode** — Hit real Stripe test API in integration tests

## Minimum Viable Fix

Create `tests/fixtures/stripe/` with real webhook payloads:
- `customer.subscription.created.json`
- `customer.subscription.updated.json`
- `checkout.session.completed.json`

Use these in gateway tests instead of fabricated objects.

## Verification

- [ ] Gateway tests use recorded real API responses
- [ ] CI fails if response shape changes
- [ ] Webhook handler tests use real webhook payloads

## Related

- BUG-045: Stripe API breaking change not caught by tests
- DEBT-074: Missing boundary integration tests
- Python equivalent: `pytest-vcr`, `responses`, `httpretty`
