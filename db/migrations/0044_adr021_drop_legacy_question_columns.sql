-- ADR-021 phase 3, second contract step: content lives only in revisions.
--
-- Migration 0043 made these columns nullable, stopped every write to them and
-- removed them from the schema, so the release that shipped it neither reads
-- nor writes them. They are dropped here, in a later release, so the
-- deployment serving during this build (0043's) is unaffected.
--
-- N-1: the serving deployment's Drizzle schema has no such columns, and no
-- query names them.
--
-- Locks: DROP COLUMN takes ACCESS EXCLUSIVE on questions until commit; it is
-- a catalog change that rewrites no rows, on a small content table.
ALTER TABLE "questions" DROP COLUMN "stem_md";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "explanation_md";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "reference_md";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "difficulty";
