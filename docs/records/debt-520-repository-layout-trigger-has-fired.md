# DEBT-520: ADR-013's Repository-Layout Trigger Has Fired Without a Decision

**Status:** Verifying — ADR-013's amendment lands in this pull request, which closes this record as Resolved; due 2026-11-22
**Priority:** P4
**Date:** 2026-10-11

---

## Summary

ADR-013 kept `src/adapters/repositories/` flat, and promised to restructure it by aggregate "when a new aggregate is introduced, or the flat list starts to hinder navigation". Since then, question feedback, renewal consent and notices, trial card setup, Clerk events, deleted Clerk users, idempotency keys and pending Stripe customer cleanups have each added a repository, and no decision was recorded either way.

## Evidence

Checked at `34d9aea0`.

- ADR-013, "Trigger to Restructure", and its 2026-02-09 status note, which deferred it once. ADR-013 still reads Accepted.
- `src/adapters/repositories/` holds 25 non-test entries: 17 `drizzle-*-repository.ts` files, the barrel, six helpers and `shared/`. Eight of the 17 are outside ADR-013's four aggregates.
- The newer repositories do not fit those aggregates: idempotency keys serve every keyed action, and the Clerk and Stripe event ledgers serve webhooks.
- `src/application/ports/` is flat too, one file per repository.
- 97 files outside `docs/` name a repository path, 81 of them in `tests/integration/`.

## Impact

None at runtime. An ADR whose trigger has fired without a decision misleads: readers cannot tell whether the flat layout is intended.

## Options

1. **Restructure by aggregate,** as ADR-013 promised. Folders of one to four files, a mismatch with the flat ports, and about 97 importers to change, for no navigation gain the file names do not already give.
2. **Keep the flat layout,** and withdraw the trigger. *Recommended.*

## Resolution (proposed)

Option 2, as an amendment to ADR-013, the repository's usual way to change an accepted decision (`docs/adr/README.md`, "How to Propose a New ADR"); no ADR has been superseded so far. The amendment keeps the folder flat for the reasons above, and withdraws the aggregate list and the trigger without setting a new one. Update ADR-013's status line, its `docs/adr/README.md` index row and summary to name the amendment. No code changes.

## Verification

- [ ] ADR-013 carries a dated amendment keeping the folder flat with no trigger, and its status and index row name it.

## Related

- ADR-013 (`docs/adr/adr-013-repository-organization.md`).

Corrected 2026-11-15: content releases added no repository (their write side is in `scripts/content-release/`); listed the repositories that did; recommended an amendment over a superseding ADR, keeping the folder flat.
