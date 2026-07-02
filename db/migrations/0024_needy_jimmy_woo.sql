ALTER TABLE "practice_session_question_states" DROP CONSTRAINT "practice_session_question_states_latest_answer_chk";--> statement-breakpoint
ALTER TABLE "practice_session_question_states" DROP CONSTRAINT "practice_session_question_states_draft_saved_chk";--> statement-breakpoint
UPDATE "practice_session_question_states"
SET "latest_is_correct" = false
WHERE "latest_selected_choice_id" IS NULL
  AND "latest_is_correct" IS TRUE
  AND "latest_answered_at" IS NOT NULL;--> statement-breakpoint
UPDATE "practice_session_question_states"
SET "draft_saved_at" = COALESCE("draft_saved_at", "updated_at", "created_at", now())
WHERE "draft_saved_at" IS NULL
  AND ("draft_selected_choice_id" IS NOT NULL OR "draft_cumulative_ms" > 0);--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ADD CONSTRAINT "practice_session_question_states_latest_answer_chk" CHECK (("practice_session_question_states"."latest_is_correct" IS NULL) = ("practice_session_question_states"."latest_answered_at" IS NULL)
          AND ("practice_session_question_states"."latest_selected_choice_id" IS NOT NULL OR "practice_session_question_states"."latest_is_correct" IS NOT TRUE)
          AND ("practice_session_question_states"."latest_selected_choice_id" IS NULL OR ("practice_session_question_states"."latest_is_correct" IS NOT NULL AND "practice_session_question_states"."latest_answered_at" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ADD CONSTRAINT "practice_session_question_states_draft_saved_chk" CHECK (("practice_session_question_states"."draft_selected_choice_id" IS NULL AND "practice_session_question_states"."draft_cumulative_ms" = 0)
          OR "practice_session_question_states"."draft_saved_at" IS NOT NULL);
