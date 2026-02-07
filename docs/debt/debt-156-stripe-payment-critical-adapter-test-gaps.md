# DEBT-156: Stripe Payment-Critical Adapter Test Gaps

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

Three payment-critical adapter modules have no direct unit-test coverage:

- `src/adapters/gateways/stripe/stripe-webhook-processor.ts`
- `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts`
- `src/adapters/gateways/stripe/stripe-retry.ts`

Current behavior is covered indirectly through higher-level tests, but key normalization/retry/error-mapping paths are not pinned by focused specs.

## Impact

- Regression risk in webhook parsing and signature/payload failure handling
- Regression risk in subscription normalization (price/status/user metadata mapping)
- Regression risk in retry/backoff and logging behavior for transient Stripe failures

## Evidence

- No colocated test files for these modules:
  - Missing: `stripe-webhook-processor.test.ts`
  - Missing: `stripe-subscription-normalizer.test.ts`
  - Missing: `stripe-retry.test.ts`
- Existing Stripe tests currently cover checkout/customer/status paths, but not these modules directly.

## Resolution

1. Add colocated unit tests for each module using deterministic fixtures and fake logger.
2. Cover both success and failure paths:
   - `stripe-webhook-processor`: signature failure, schema failure, supported event mapping, passthrough unknown events
   - `stripe-subscription-normalizer`: metadata/plan/status validation, Stripe retrieve parse failures
   - `stripe-retry`: transient retry logging and non-retry propagation
3. Ensure tests remain adapter-level and do not rely on external network calls.

## Verification

- [ ] `stripe-webhook-processor.test.ts` added with success/failure coverage
- [ ] `stripe-subscription-normalizer.test.ts` added with success/failure coverage
- [ ] `stripe-retry.test.ts` added with retry/non-retry coverage
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run`

## Related

- `docs/specs/spec-009-payment-gateway.md`
- `docs/adr/adr-005-payment-boundary.md`
- `docs/adr/adr-014-stripe-eager-sync.md`
