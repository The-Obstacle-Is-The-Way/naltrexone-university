# BUG-383: The Content Repository's Schema Guide Shows Commands the App Refuses

**Status:** Blocked — the owner has the content repository's building agent correct the Commands block and two dry-run lines of its `questions/SCHEMA.md`; due 2026-11-29
**Priority:** P4
**Date:** 2026-11-22

---

## Summary

The content repository, `addiction-final-2026`, tells authors how to import drafts and seed them in the Commands block of its `questions/SCHEMA.md`. Four of the block's six commands are always refused by this repository's importer or seed, before any write: the three that pass `--`, and the retired placeholder variable. The other two depend on the reader's setup. A bare import writes straight into the live tree while that tree is empty, and is refused once it holds content. A bare seed runs only where `DATABASE_URL` is already exported. This was BUG-353's Waiting row, whose trigger, the owner's next change to the content repository, the 2026-11-22 queue review found fired.

## Evidence

Checked on the content repository's `main` and this repository's `dev`, 2026-11-22:

- **The `--` separator.** `pnpm content:import:drafts -- --dry-run` and `-- --status published` (the guide's lines 565, 571 and 580) pass `--` to the importer under pnpm 11. The importer accepts only `--in`, `--out`, `--status` and `--dry-run`, and throws `Unknown argument: --` (`scripts/import-draft-questions.ts:26-32`). The same `-- --dry-run` appears outside the block, at lines 583 and 756.
- **A bare import.** `pnpm content:import:drafts` (line 568) writes to `content/questions/imported` by default (`scripts/import-draft-questions.ts:20`). The importer refuses an output root that is not empty (`:87-91`, `:161`). That tree is gitignored (`.gitignore:58`), so in a fresh clone it is empty and the import writes into it. This repository's guide imports into a fresh staging directory outside the live tree instead (`content/drafts/questions/SCHEMA.md:483-485`).
- **A bare seed.** `pnpm db:seed` (lines 574 and 580) needs an explicit `DATABASE_URL` and refuses the dotenv fallback (`scripts/database/database-target.ts:30-39`).
- **The placeholder variable.** `SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed` (line 577) is refused: "SEED_INCLUDE_PLACEHOLDERS is set, but the seed no longer reads it" (`scripts/seed/seed-options.ts:21-23`). The flag `--include-placeholders` replaced it.
- **The current wording** is in this repository's `content/drafts/questions/SCHEMA.md:479-501` and `:680`.
- **Why the owner.** In the content repository, a building agent authors each pull request and the owner's session verifies and merges it. That repository's session confirmed the defect on 2026-11-22 and cannot author the fix itself.

## Impact

An author who follows the content repository's guide gets an error or, in a fresh clone, imports straight into the live tree, which this repository's guide avoids. A refused command writes nothing.

## Resolution (decided)

Replace the content repository's Commands block (lines 563–581) and the two `-- --dry-run` lines (583 and 756) with this repository's current wording, through that repository's own pull-request process.

## Verification

- [ ] The content repository's `questions/SCHEMA.md` on `main` shows `--include-placeholders`, no `--` separator, an explicit `DATABASE_URL` and a fresh `--out` directory. Then close this record, with that commit in the closing pull request's description.

## Related

- BUG-353: the closed record whose Waiting row this was.
