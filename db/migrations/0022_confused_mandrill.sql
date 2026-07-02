CREATE UNIQUE INDEX "choices_id_question_id_uq" ON "choices" USING btree ("id","question_id");--> statement-breakpoint
UPDATE "practice_session_question_states" AS "state"
SET "latest_selected_choice_id" = NULL
WHERE "state"."latest_selected_choice_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "choices"
    WHERE "choices"."id" = "state"."latest_selected_choice_id"
      AND "choices"."question_id" = "state"."question_id"
  );--> statement-breakpoint
UPDATE "practice_session_question_states" AS "state"
SET "draft_selected_choice_id" = NULL
WHERE "state"."draft_selected_choice_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "choices"
    WHERE "choices"."id" = "state"."draft_selected_choice_id"
      AND "choices"."question_id" = "state"."question_id"
  );--> statement-breakpoint
ALTER TABLE "practice_session_question_states" DROP CONSTRAINT "practice_session_question_states_latest_selected_choice_id_choices_id_fk";
--> statement-breakpoint
ALTER TABLE "practice_session_question_states" DROP CONSTRAINT "practice_session_question_states_draft_selected_choice_id_choices_id_fk";
--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ADD CONSTRAINT "practice_session_question_states_latest_choice_question_fk" FOREIGN KEY ("latest_selected_choice_id","question_id") REFERENCES "public"."choices"("id","question_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ADD CONSTRAINT "practice_session_question_states_draft_choice_question_fk" FOREIGN KEY ("draft_selected_choice_id","question_id") REFERENCES "public"."choices"("id","question_id") ON DELETE restrict ON UPDATE no action;
