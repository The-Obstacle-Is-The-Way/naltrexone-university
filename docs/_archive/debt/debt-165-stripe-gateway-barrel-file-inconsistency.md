# DEBT-165: Stripe Gateway Modules Bypass Barrel File Pattern

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The `src/adapters/gateways/` directory has an `index.ts` barrel file, but most Stripe gateway modules are imported directly rather than re-exported through it:

**Not re-exported from barrel:**
- `stripe/stripe-portal.ts`
- `stripe/stripe-client.ts`
- `stripe/stripe-webhook-schemas.ts`
- `stripe/stripe-webhook-processor.ts`
- `stripe/stripe-retry.ts`
- `stripe/stripe-checkout-sessions.ts`
- `stripe/stripe-subscription-status.ts`
- `stripe/stripe-customers.ts`
- `stripe/stripe-subscription-normalizer.ts`

These are imported directly across the codebase (e.g., `from '@/src/adapters/gateways/stripe/stripe-portal'`).

## Impact

- Inconsistent import patterns across the codebase
- No centralized API surface for the Stripe gateway module
- Moving files requires updating all direct importers
- Low severity — the code works correctly, this is purely organizational

## Resolution

Create `src/adapters/gateways/stripe/index.ts` barrel file and re-export public API from there. Update imports to use barrel.

## Verification

- [ ] Barrel file created for `stripe/` subdirectory
- [ ] Imports updated to use barrel
- [ ] `pnpm typecheck` passes

## Related

- `src/adapters/gateways/index.ts`
- `src/adapters/gateways/stripe/` (9 modules)
