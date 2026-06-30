UPDATE "practice_session_question_states"
SET
  "latest_selected_choice_id" = NULL,
  "latest_is_correct" = NULL,
  "latest_answered_at" = NULL
WHERE ("latest_is_correct" IS NULL) <> ("latest_answered_at" IS NULL)
   OR ("latest_selected_choice_id" IS NOT NULL AND ("latest_is_correct" IS NULL OR "latest_answered_at" IS NULL));--> statement-breakpoint
UPDATE "practice_session_question_states"
SET "draft_saved_at" = COALESCE("updated_at", "created_at", now())
WHERE "draft_selected_choice_id" IS NOT NULL
  AND "draft_saved_at" IS NULL;--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ADD CONSTRAINT "practice_session_question_states_latest_answer_chk" CHECK (("practice_session_question_states"."latest_is_correct" IS NULL) = ("practice_session_question_states"."latest_answered_at" IS NULL)
          AND ("practice_session_question_states"."latest_selected_choice_id" IS NULL OR ("practice_session_question_states"."latest_is_correct" IS NOT NULL AND "practice_session_question_states"."latest_answered_at" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ADD CONSTRAINT "practice_session_question_states_draft_saved_chk" CHECK ("practice_session_question_states"."draft_selected_choice_id" IS NULL OR "practice_session_question_states"."draft_saved_at" IS NOT NULL);
