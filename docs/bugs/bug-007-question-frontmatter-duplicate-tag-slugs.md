# BUG-007: Question Frontmatter Allows Duplicate Tag Slugs (Breaks Seeding via `question_tags` PK)

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-01
**Resolved:** 2026-02-01

## Summary

`question_tags` uses a composite primary key (`question_id`, `tag_id`). If a question MDX frontmatter contains the same tag slug twice, the seed script attempts to insert duplicate `question_tags` rows, triggering a DB constraint failure and breaking `pnpm db:seed` (and CI).

## Location

- **Schema:** `lib/content/schemas.ts` (`QuestionFrontmatterSchema`)
- **Seed insertion:** `scripts/seed.ts` inserts `questionTags` from `seedFromFile.tags`
- **DB constraint:** `db/schema.ts` (`question_tags` composite PK)

## Repro

1. Add a duplicate tag slug to a question file’s frontmatter (`tags: [...]`).
2. Run `pnpm db:seed`.
3. Observe a DB error due to duplicate `question_tags` primary key.

## Fix

- Added a `QuestionFrontmatterSchema` refinement that rejects duplicate tag slugs (`tags` must be unique by `slug`).

## Regression Test

- `lib/content/schemas.test.ts`

## Acceptance Criteria

- Duplicate tag slugs in question frontmatter fail validation before any DB writes.
- CI seeding remains stable even when content changes introduce accidental duplicates.

