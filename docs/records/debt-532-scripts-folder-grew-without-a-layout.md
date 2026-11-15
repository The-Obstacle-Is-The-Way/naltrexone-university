# DEBT-532: The Scripts Folder Has Inconsistent Shared Helpers and No Layout

**Status:** Open — close as Resolved: the layout and shared helpers shipped in #1593, #1603 and #1604; the content family's move becomes a Waiting row on DEBT-483's bootstrap
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

At the audit (`0680cb2d`), `scripts/` held 78 scripts and modules, 49 of them in its root, with shared building blocks reimplemented script by script. Three pull requests fixed it: #1593, #1603 and #1604, merged into `dev` on 2026-10-23 and 2026-10-24 and released in promotion #1613 on 2026-11-01. The non-content families now sit in folders (`database/`, `deploy/`, `test-lanes/`, `ci/`, `feedback/`, `operations/`, `review/`, `dependencies/`, `records/`, `watchers/`, `quality/`, `lib/`), and `scripts/lib/` holds the shared entry detector, loopback check, GitHub CLI transport, issue-list transport and command runner. The review's defects were filed and fixed separately as BUG-353 to BUG-361.

Only the content family stayed where it was, for BUG-351 and DEBT-531, which have both closed.

## Evidence

Checked at `34d9aea0`.

- The root of `scripts/` now holds only the content family and the README: nine scripts (`seed.ts`, `seed-all-environments.ts`, `seed-production.ts`, `seed-environment-runtime.ts`, `seed-environment-targets.ts`, `seed-helpers.ts`, `draft-question-import.ts`, `import-draft-questions.ts`, `prepare-seed-corpus.ts`) and their ten tests, beside `seed/` and `content-release/`.
- Moving them would change about 200 references in 52 files, mostly `tests/integration/`.
- After DEBT-483 bootstraps production, the seeds refuse it (`assertNoActiveRelease`, `scripts/seed/question-syncer.ts:173,208`), so `seed-production.ts` (`pnpm db:seed:prod`) can then only refuse, and can be deleted.
- `scripts/README.md:12` says this record owns the content move. Its other citations (`:21,35,40,41`) explain choices this record kept, and stay valid once the ID resolves through the ledger.

## Impact

None at runtime. The root is now one family, so the remaining move is tidiness, not navigation.

## Options

1. Move the content family now. It touches the commands DEBT-483's irreversible bootstrap runs, just before the owner runs it.
2. Move it after the bootstrap, together with deleting the production seed path that then only refuses. *Recommended.*

## Resolution (decided)

The audit's plan, delivered in #1593, #1603 and #1604: fix the defects, add package commands and shared helpers, then move one family at a time. The owner's delegated decisions of 2026-10-19 stand:

1. Keep the header-secret operator preflight.
2. Keep production seeding as an operator command; no protected Actions job.
3. Keep the merge verdict as the documented pre-merge command; no extra required status.
4. Keep native zero-install `.mts` for the two scheduled jobs.
5. Move one family at a time; leave the content paths for their owners.
6. Classify BUG-358 as P4.

The content family's move goes to a Waiting row on DEBT-483's bootstrap (option 2 above), and this record closes. The closing pull request also points `scripts/README.md:12` at that Waiting row.

## Verification

- [x] The non-content families moved one at a time with passing directory and family tests (#1593, #1603, #1604).
- [x] Shared helpers and package commands are in place; no test mocks `node:child_process`.
- [x] Released to production in promotion #1613 (2026-11-01).
- [ ] The content family's move is preserved as a Waiting row with its trigger.

## Related

- BUG-353 to BUG-361: the defects the audit found.
- DEBT-483: the production content bootstrap.
- ADR-023, ADR-024.

Corrected 2026-11-15: the work merged as #1593, #1603 and #1604 and shipped in #1613, not as #1560, which closed unmerged; the content move becomes a Waiting row on DEBT-483's bootstrap; finished build history, the baseline census and the declined alternatives are in git at `34d9aea0`.
