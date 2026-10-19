-- BUG-351: nullable metadata on the singleton pointer. Existing content and
-- bootstrap remain unchanged. The table has at most one row; these brief DDL
-- locks need no backfill and remain compatible with the previous app version.
ALTER TABLE "content_release_pointer" ADD COLUMN "source_commit" text;--> statement-breakpoint
ALTER TABLE "content_release_pointer" ADD CONSTRAINT "content_release_pointer_source_commit_chk" CHECK ("content_release_pointer"."source_commit" IS NULL OR "content_release_pointer"."source_commit" ~ '^[0-9a-f]{40}$');
