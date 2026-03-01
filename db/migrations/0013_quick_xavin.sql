CREATE TYPE "public"."attempt_retry_origin" AS ENUM('history', 'dashboard', 'bookmarks', 'session_review', 'other');--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "retry_of_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "retry_origin" "attempt_retry_origin";--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "retry_session_id" uuid;--> statement-breakpoint
CREATE INDEX "attempts_retry_of_attempt_id_idx" ON "attempts" USING btree ("retry_of_attempt_id");