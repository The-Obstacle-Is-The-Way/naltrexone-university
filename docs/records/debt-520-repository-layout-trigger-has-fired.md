# DEBT-520: ADR-013's Repository-Layout Trigger Has Fired Without a Decision

**Status:** Open — decide whether the repositories stay flat or move into aggregate folders, and record it as an ADR
**Priority:** P4
**Date:** 2026-10-11

---

## Summary

ADR-013 kept `src/adapters/repositories/` flat, and promised to restructure it by aggregate "when a new aggregate is introduced, or the flat list starts to hinder navigation". Since then, content releases, question feedback, renewal consent and notices, and trial payment-method setup have each added repositories. The folder now holds 25 files, and no decision was recorded either way.

## Evidence

- ADR-013, "Trigger to Restructure": "We will restructure by aggregate when a new aggregate is introduced". Its status note of 2026-02-09 already deferred it once.
- `src/adapters/repositories/` holds 25 non-test entries, among them `drizzle-question-feedback-repository.ts`, `drizzle-renewal-consent-record-repository.ts`, `drizzle-renewal-notice-delivery-repository.ts` and `drizzle-trial-payment-method-setup-operation-repository.ts`, none in ADR-013's aggregate list.
- The documentation census of 2026-10-11 (DEBT-518) found it.

## Impact

None at runtime. An ADR whose trigger has fired without a decision misleads: readers cannot tell whether the flat layout is still intended.

## Options

1. **Restructure by aggregate,** keeping `src/adapters/repositories/index.ts`'s exports API-compatible, as ADR-013 promised.
2. **Keep the flat layout,** and supersede ADR-013 with the reason: for example, that the barrel and file names already group by aggregate.

## Resolution (decided)

Not yet. Weigh both against the import churn and the current navigation cost, then record the choice as a new ADR that supersedes ADR-013.

## Verification

- [ ] A new ADR records the decision, and ADR-013's status names it.

## Related

- [ADR-013](../adr/adr-013-repository-organization.md)
