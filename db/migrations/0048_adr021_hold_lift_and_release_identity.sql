-- ADR-021 phase 4c (DEBT-483): a lift's record, and a release's identity.
--
-- 1. A lifted hold records why, and on whose authority, as a placed hold
--    does. Lifting puts a held revision back into activations, so it is a
--    decision with its own record. The check requires both exactly when
--    lifted_at is set; its IS NOT NULL terms are explicit because a CHECK
--    passes when its expression is NULL. 0047's lift-once trigger already
--    lets these columns be written only in the update that lifts the hold.
-- 2. A release is its manifest on its base. 0047 made manifest_hash unique on
--    its own, but the manifest does not name the parent. A content set staged
--    on one base and never activated could then never be staged on a newer
--    base: the insert would collide, and reusing the old release fails
--    activation's parent check (promotion #1295 review). The key becomes
--    (manifest_hash, parent_release_id), as two partial indexes, one with a
--    parent and one without, so it holds on any supported Postgres without
--    NULLS NOT DISTINCT.
--
-- N-1: the serving deployment reads neither table. No hold and no release
-- exists yet in any deployed database, so every row satisfies the check.
--
-- Locks: ACCESS EXCLUSIVE on content_releases and question_holds, both
-- empty, until commit.
DROP INDEX "content_releases_manifest_hash_uq";--> statement-breakpoint
ALTER TABLE "question_holds" ADD COLUMN "lift_reason" text;--> statement-breakpoint
ALTER TABLE "question_holds" ADD COLUMN "lift_authority" text;--> statement-breakpoint
CREATE UNIQUE INDEX "content_releases_manifest_hash_parent_uq" ON "content_releases" USING btree ("manifest_hash","parent_release_id") WHERE parent_release_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "content_releases_manifest_hash_root_uq" ON "content_releases" USING btree ("manifest_hash") WHERE parent_release_id IS NULL;--> statement-breakpoint
ALTER TABLE "question_holds" ADD CONSTRAINT "question_holds_lift_record_chk" CHECK (("question_holds"."lifted_at" IS NULL AND "question_holds"."lift_reason" IS NULL AND "question_holds"."lift_authority" IS NULL)
        OR ("question_holds"."lifted_at" IS NOT NULL
          AND "question_holds"."lift_reason" IS NOT NULL AND "question_holds"."lift_reason" ~ '[^[:space:]]'
          AND "question_holds"."lift_authority" IS NOT NULL AND "question_holds"."lift_authority" ~ '[^[:space:]]'));