# DEBT-520: ADR-013's Repository-Layout Trigger Has Fired Without a Decision

**Status:** Open — closes as Resolved in this pull request: ADR-013's 2026-11-15 amendment keeps the repositories flat and withdraws the trigger
**Priority:** P4
**Date:** 2026-10-11

---

## Summary

ADR-013 kept `src/adapters/repositories/` flat, and promised to restructure it by aggregate "when a new aggregate is introduced, or the flat list starts to hinder navigation". Since then, question feedback, renewal consent and notices, trial card setup, Clerk events, deleted Clerk users, idempotency keys and pending Stripe customer cleanups have each added a repository, and no decision was recorded either way.

## Evidence

Checked 2026-11-15.

- ADR-013, "Trigger to Restructure", and its 2026-02-09 status note, which deferred it once. ADR-013 still read Accepted.
- `src/adapters/repositories/` holds 25 non-test entries: 17 `drizzle-*-repository.ts` files, the barrel, six helpers and `shared/`. Eight of the 17 are not in ADR-013's lists. All but idempotency keys fit one of its four aggregates, which would leave Billing with seven repositories.
- Seven repositories have unit tests beside them; the other ten are tested in `tests/integration/`.
- `src/application/ports/` is flat too, one file per repository.
- 92 files outside the folder import from it, 81 of them in `tests/integration/`; only 9 import the barrel.

## Impact

None at runtime. An ADR whose trigger has fired without a decision misleads: readers cannot tell whether the flat layout is intended.

## Options

1. **Restructure by aggregate,** as ADR-013 promised. Uneven folders, from seven Billing repositories to none for idempotency keys, a mismatch with the flat ports, and about 92 importers to change, for no navigation gain the file names do not already give.
2. **Keep the flat layout,** and withdraw the trigger.

## Resolution (decided)

Option 2, decided 2026-11-15 by the reviewing session, at the owner's delegation of engineering calls for this review (records accuracy review, 2026-11-15). It is an amendment to ADR-013, the repository's usual way to change an accepted decision (`docs/adr/README.md`, "How to Propose a New ADR"). The amendment keeps the folder flat for the reasons above, and withdraws the aggregate list and the trigger without setting a new one. No code changes.

## Verification

- [x] ADR-013 carries a dated amendment after its References, keeping the folder flat with no trigger and naming its decision maker; its status line and `docs/adr/README.md` index row and summary name the amendment (this pull request).

## Related

- ADR-013 (`docs/adr/adr-013-repository-organization.md`).

Corrected 2026-11-15: content releases added no repository (their write side is in `scripts/content-release/`); listed the repositories that did; recommended an amendment over a superseding ADR, keeping the folder flat. Corrected the reasons: ten of the 17 repositories are tested in `tests/integration/`, not beside them; `StripeEventRepository` is already in ADR-013's Billing list, and four newer repositories belong there too, so the folders would not hold "one to four files"; 92 files import repository paths. The amendment moved after References, drops its placement rule for helpers, which two root helpers already broke, and names its decision maker.
