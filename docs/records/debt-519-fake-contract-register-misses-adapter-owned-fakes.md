# DEBT-519: The Fake-Contract Register Misses Adapter-Owned Fakes

**Status:** Open — scan every non-test `.ts` file under `src/adapters/**/test-helpers/` for exported `Fake*` bindings, red first, and give `FakeStripePortalConfigurations` its own row
**Priority:** P4
**Date:** 2026-10-11

---

## Summary

The fake-contract register (`docs/guides/testing/fake-contracts.md`) records each maintained fake's evidence that it behaves like the real thing. A test forces every fake in the application barrel into it, but adapter-owned fakes are named by hand, so a new one would not be forced in. DEBT-472 deferred this until a second adapter-owned fake appeared; `FakeStripePortalConfigurations` (ed9e1d09, 2026-09-27) is one. Its evidence is recorded, but under its parent's name: `FakeStripeCheckoutClient` builds it as its `billingPortal.configurations` member, and that fake's row describes it and cites the shared contract's tenth scenario. So nothing drifts unrecorded today; the gap is the hand list.

## Evidence

- `tests/fake-contract-register-source-scan.ts:8`: `const ADAPTER_OWNED_FAKE_NAMES = ['FakeStripeCheckoutClient'] as const;`
- `src/adapters/gateways/stripe/test-helpers/fake-stripe-portal-configurations.ts:32` exports the class; `fake-stripe-checkout-client.ts:722-730` wires it in; `fake-contracts.md:69` holds its 2026-09-28 clarification; `tests/shared/stripe-checkout-client-contract-cases.ts:11` is the tenth scenario.
- These are the only two exported `Fake` classes outside the application barrel. `.claude/rules/testing.md` puts `src/` test support in its layer's `test-helpers/` directory, and `tests/test-support-location-policy.test.ts` enforces that for `*-test-helpers`, `*.fixtures` and `*.probes` files. Neither fixes a fake's file name, so a scan by name prefix could miss one that follows the rule; a scan of every file in those directories would not.

## Impact

None today. The next adapter-owned fake could go unrecorded, the drift the register exists to prevent (DEBT-472).

## Options

1. **Discover adapter-owned fakes,** and require a row for each exported `Fake*` binding. *Chosen:* what DEBT-472 decided; a few lines replace the hand list.
2. **Add the name to the hand list.** The next one must then be remembered.

## Resolution (decided)

Option 1. In `tests/fake-contract-register-source-scan.ts`, replace `ADAPTER_OWNED_FAKE_NAMES` with a scan of every `.ts` file under `src/adapters/**/test-helpers/` except `*.test.ts`, whatever its name, that collects exported `Fake*` bindings, whether a class, a constant or a function, with the parser the file already uses. Red first in `tests/fake-contract-register.test.ts`: a synthetic adapter source exporting `FakeX`, in a file not named `fake-*.ts`, yields `FakeX`; a non-class export `FakeY` is found too; a `*.test.ts` source is skipped; and the live check fails while `FakeStripePortalConfigurations` has no row. Then move the portal-configuration clarification out of `FakeStripeCheckoutClient`'s row into its own row. Done when `pnpm test --run tests/fake-contract-register.test.ts` passes with no hand list and no file-name pattern.

## Verification

- [ ] The scan discovers adapter-owned fakes in any non-test file under `src/adapters/**/test-helpers/`, and a test proves a new one without a row fails.
- [ ] `FakeStripePortalConfigurations` has its own row naming the tenth contract scenario.

## Related

- DEBT-472 (closed): the test-double fidelity work that deferred this.

Corrected 2026-11-15: the register already records the portal fake's evidence, in `FakeStripeCheckoutClient`'s row, so the gap is the hand list, not missing evidence; priority P3 to P4; the Resolution names the files and the red test, and scans every non-test file under adapter `test-helpers/` rather than `fake-*.ts`, since no rule fixes a fake's file name.
