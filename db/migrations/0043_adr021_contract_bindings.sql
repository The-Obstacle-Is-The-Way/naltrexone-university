-- ADR-021 phase 3, first contract step: every binding is required.
--
-- 1. assert_question_revisions_bound_v1() (migration 0042) fails the
--    migration if any session state, attempt or choice names no revision, or
--    any question has no current revision. Production had none after 0042.
-- 2. questions_current_revision_fk becomes DEFERRABLE INITIALLY DEFERRED. A
--    new question and its first revision point at each other; the seed now
--    writes the question with its revision's id and the revision after it,
--    and the key is checked at commit.
-- 3. The four bindings become NOT NULL.
-- 4. The legacy text columns on questions (stem_md, explanation_md,
--    difficulty; reference_md was already nullable) become nullable and are
--    no longer written. They are not dropped here: the serving deployment
--    still selects them until this release replaces it. The next migration
--    drops them, with the index below already gone.
--
-- N-1: the serving deployment binds every attempt and session state it
-- writes (#1233, 0042) and writes no choice or question. The seed of the
-- previous commit inserts a question without its current revision and fails
-- loudly; seed from the deployed commit.
--
-- Locks: SET NOT NULL scans each table under ACCESS EXCLUSIVE until commit.
-- These are small tables (production had 306 session states and 249
-- attempts at 0041), and the statements run last.
SELECT "assert_question_revisions_bound_v1"();--> statement-breakpoint
DROP INDEX "questions_status_difficulty_idx";--> statement-breakpoint
ALTER TABLE "questions" ALTER CONSTRAINT "questions_current_revision_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "stem_md" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "explanation_md" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "difficulty" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ALTER COLUMN "question_revision_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "choices" ALTER COLUMN "question_revision_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ALTER COLUMN "question_revision_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "current_revision_id" SET NOT NULL;
