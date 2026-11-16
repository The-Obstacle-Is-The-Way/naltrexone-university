# DEBT-532: The Scripts Folder Has Inconsistent Shared Helpers and No Layout

**Status:** Open — closes as Resolved in this pull request: the layout and shared helpers shipped (#1593, #1603, #1604; promotion #1613), and the lasting decisions are in `scripts/README.md`
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

At the audit (`0680cb2d`), `scripts/` held 78 scripts and modules, 49 of them in its root, with shared building blocks reimplemented script by script. Three pull requests fixed it: #1593, #1603 and #1604, merged into `dev` on 2026-10-23 and 2026-10-24 and released in promotion #1613 on 2026-11-01. The non-content families now sit in folders (`database/`, `deploy/`, `test-lanes/`, `ci/`, `feedback/`, `operations/`, `review/`, `dependencies/`, `records/`, `watchers/`, `quality/`, `lib/`), and `scripts/lib/` holds the shared entry detector, loopback check, GitHub CLI transport, issue-list transport and command runner. The review's defects were filed and fixed separately as BUG-353 to BUG-361.

Only the content family stayed where it was, for BUG-351 and DEBT-531, which have both closed.

## Evidence

Checked at `34d9aea0`.

- The root of `scripts/` now holds only the content family and the README: nine scripts (`seed.ts`, `seed-all-environments.ts`, `seed-production.ts`, `seed-environment-runtime.ts`, `seed-environment-targets.ts`, `seed-helpers.ts`, `draft-question-import.ts`, `import-draft-questions.ts`, `prepare-seed-corpus.ts`) and their tests, beside `seed/` and `content-release/`.
- Moving them would change about 200 references in 52 files, mostly `tests/integration/`.
- After DEBT-483 bootstraps production, the seeds refuse it (`assertNoActiveRelease`, `scripts/seed/question-syncer.ts:173,208`), so `seed-production.ts` (`pnpm db:seed:prod`) can then only refuse, and can be deleted.
- The record's lasting decisions lived only here, and `scripts/README.md` cited it for them. They are now in the README's conventions: the content family (`:12`), automation calling scripts by path (`:21`, BUG-329), the remote-target opt-in (`:35`, BUG-360), content test-suite names (`:40`), and "Kept on purpose" (`:42`), which holds the owner's 2026-10-19 decisions 1–4 and the audit's retained choices.

## Impact

None at runtime. The root is now one family, so the remaining move is tidiness, not navigation.

## Options

1. Move the content family now. It touches the commands DEBT-483's irreversible bootstrap runs, just before the owner runs it.
2. Move it after the bootstrap.
3. Leave it where it is, and delete the production seed after the bootstrap.

## Resolution (decided)

The audit's plan, delivered in #1593, #1603 and #1604: fix the defects, add package commands and shared helpers, then move one family at a time. The owner's delegated decisions of 2026-10-19 stand: 1–4 are in `scripts/README.md` under "Kept on purpose"; 5, one family at a time, is done; 6 classified BUG-358 as P4.

For the content family, option 3, decided 2026-11-15 by the reviewing session, at the owner's delegation of engineering calls for this review (records accuracy review, 2026-11-15). The move is tidiness: the root holds one family, and moving it would touch the commands DEBT-483's bootstrap runs. Deleting `seed-production.ts` and `pnpm db:seed:prod` once the bootstrap makes them refuse goes to DEBT-483's Waiting row.

## Verification

- [x] The non-content families moved one at a time with passing directory and family tests (#1593, #1603, #1604).
- [x] Shared helpers and package commands are in place; no test mocks `node:child_process`.
- [x] Released to production in promotion #1613 (2026-11-01).
- [x] The lasting decisions and retained choices are in `scripts/README.md`'s conventions, which no longer cite this record (this pull request).
- [x] The content family's move is declined, and the production seed's deletion is a clause in DEBT-483's Waiting row (index, this pull request).

## Related

- BUG-353 to BUG-361: the defects the audit found.
- BUG-329: the child database command that resolves the target again.
- BUG-360: owns the remote-target opt-in, the "second rule".
- DEBT-483: the production content bootstrap.
- ADR-023, ADR-024.

Corrected 2026-11-15: the work merged as #1593, #1603 and #1604 and shipped in #1613, not as #1560, which closed unmerged. The content move is declined (option 3) rather than waiting on the bootstrap, and only the production seed's deletion goes to DEBT-483's Waiting row. The lasting decisions moved into `scripts/README.md`, and the "second rule" item moved to BUG-360. Finished build history, the baseline census and the declined alternatives are in git at `34d9aea0`.
