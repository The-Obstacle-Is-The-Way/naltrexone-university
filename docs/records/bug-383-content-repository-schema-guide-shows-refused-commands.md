# BUG-383: The Content Repository's Schema Guide Shows Commands the App Refuses

**Status:** Blocked — the owner has the content repository's building agent correct the Commands block of its `questions/SCHEMA.md`; due 2026-11-29
**Priority:** P4
**Date:** 2026-11-22

---

## Summary

The content repository, `addiction-final-2026`, tells authors how to import drafts and seed them in the Commands block of its `questions/SCHEMA.md`. Every command in that block is refused by this repository's importer or seed today. Each refusal comes before any write, so a reader gets an error, not a wrong import or seed. This was BUG-353's Waiting row, whose trigger, the owner's next change to the content repository, fired in the 2026-11-22 queue review.

## Evidence

Checked at the content repository's `main`, `c1e5897f`, and this repository's `dev`, 2026-11-22:

- **The `--` separator.** `pnpm content:import:drafts -- --dry-run` and `-- --status published` (the guide's lines 565, 571 and 580) pass `--` to the importer under pnpm 11. The importer accepts only `--in`, `--out`, `--status` and `--dry-run`, and throws `Unknown argument: --` (`scripts/import-draft-questions.ts:26-32`).
- **A bare import.** `pnpm content:import:drafts` (line 568) writes to `content/questions/imported` by default (`scripts/import-draft-questions.ts:20`). The importer refuses an output root that is not empty (`:87-91`, `:161`), as that live tree is once content has been imported.
- **A bare seed.** `pnpm db:seed` (lines 574 and 580) needs an explicit `DATABASE_URL` and refuses the dotenv fallback (`scripts/database/database-target.ts:30-39`).
- **The placeholder variable.** `SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed` (line 577) is refused: "SEED_INCLUDE_PLACEHOLDERS is set, but the seed no longer reads it" (`scripts/seed/seed-options.ts:21-23`). The flag `--include-placeholders` replaced it.
- **The current wording** is in this repository's `content/drafts/questions/SCHEMA.md` (around line 488): import into a fresh `--out` directory, place the approved artifact by the content pipeline, then `DATABASE_URL="$TARGET_DATABASE_URL" pnpm db:seed`, with `--include-placeholders` only for a local test database.
- **Why the owner.** In the content repository, a building agent authors each pull request and the owner's session verifies and merges it. That repository's session confirmed the defect on 2026-11-22 and cannot author the fix itself.

## Resolution (decided)

Replace the content repository's Commands block with this repository's current wording, through that repository's own pull-request process. It is done when its `questions/SCHEMA.md` shows `--include-placeholders`, no `--` separator, an explicit `DATABASE_URL` and a fresh `--out` directory.

## Verification

Read the merged `questions/SCHEMA.md` on the content repository's `main`, and record its commit here. Then close this record.

## Related

- BUG-353: the closed record whose Waiting row this was.
