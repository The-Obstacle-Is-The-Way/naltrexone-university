# DEBT-519: The Fake-Contract Register Misses Adapter-Owned Fakes

**Status:** Open — make the register scan discover adapter-owned fakes, red first, then add `FakeStripePortalConfigurations`
**Priority:** P3
**Date:** 2026-10-11

---

## Summary

The fake-contract register (`docs/guides/testing/fake-contracts.md`) records, for every maintained fake, the evidence that it behaves like its real adapter. A test forces every fake in the application barrel into it. Adapter-owned fakes are named by hand instead: `tests/fake-contract-register-source-scan.ts` lists only `FakeStripeCheckoutClient`. So `FakeStripePortalConfigurations`, added on 2026-09-27, is in neither the scan nor the register, and nothing records whether it matches Stripe.

DEBT-472 deferred this with a trigger: "a second adapter-owned fake is proposed: make discovery mechanical, red first, before it lands". That trigger fired on 2026-09-27 and went unnoticed.

## Evidence

- `tests/fake-contract-register-source-scan.ts:8`: `const ADAPTER_OWNED_FAKE_NAMES = ['FakeStripeCheckoutClient'] as const;`
- `src/adapters/gateways/stripe/test-helpers/fake-stripe-portal-configurations.ts:32`: `export class FakeStripePortalConfigurations implements PortalConfigurations`, added in ed9e1d09 (2026-09-27).
- `grep -c FakeStripePortalConfigurations docs/guides/testing/fake-contracts.md` gives 0.

## Impact

A fake whose behaviour drifts from Stripe's can keep tests green while production differs. This is the failure the register exists to prevent (DEBT-472). It is P3: the portal configuration has its own provider-contract coverage, but the register does not say so.

## Options

1. **Discover `src/adapters/**/test-helpers/fake-*.ts` mechanically,** and require a register row for each exported `Fake*` class. *Chosen:* it is what DEBT-472 decided, and it stops the next one too.
2. **Add the name to the hand list.** That fixes today's gap and leaves the next one.

## Resolution (decided)

Option 1, red first: a scan test that fails while `FakeStripePortalConfigurations` has no row, then the row, with its verification and known divergences.

## Verification

- [ ] The scan discovers adapter-owned fakes, and a test proves a new one without a row fails.
- [ ] `FakeStripePortalConfigurations` has a register row naming its provider-contract evidence.

## Related

- DEBT-472 (closed): the test-double fidelity work that deferred this.
