-- SPEC-033: Tag taxonomy migration — clean derived tag data, then remove 'domain' from enum.
-- Tags and question_tags are entirely derived from MDX source files.
-- pnpm db:seed rebuilds them. No user data is lost.
DELETE FROM question_tags;--> statement-breakpoint
DELETE FROM tags;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tags WHERE kind = 'domain') THEN
    RAISE EXCEPTION 'Cannot remove domain from tag_kind: domain rows still exist in tags';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."tag_kind";--> statement-breakpoint
CREATE TYPE "public"."tag_kind" AS ENUM('topic', 'substance', 'treatment', 'diagnosis');--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "kind" SET DATA TYPE "public"."tag_kind" USING "kind"::"public"."tag_kind";