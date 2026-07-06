-- DEBT-439 / DEBT-440 schema hardening.
-- These tables are small in current production. Standard ALTER TABLE locks are
-- accepted here; large-table constraint/index work must follow
-- docs/dev/migration-authoring.md and split validation or concurrent index
-- builds where needed.

DO $$
DECLARE
  non_object_params_json_rows integer := 0;
  cross_question_attempt_choice_rows integer := 0;
BEGIN
  SELECT count(*)::integer
    INTO non_object_params_json_rows
    FROM practice_sessions
   WHERE jsonb_typeof(params_json) <> 'object';

  RAISE NOTICE 'DEBT-439 preflight: practice_sessions rows with non-object params_json = %',
    non_object_params_json_rows;

  IF non_object_params_json_rows <> 0 THEN
    RAISE EXCEPTION
      'DEBT-439 preflight failed: % practice_sessions rows have non-object params_json',
      non_object_params_json_rows;
  END IF;

  SELECT count(*)::integer
    INTO cross_question_attempt_choice_rows
    FROM attempts a
   WHERE a.selected_choice_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM choices c
        WHERE c.id = a.selected_choice_id
          AND c.question_id = a.question_id
     );

  RAISE NOTICE 'DEBT-440 preflight: attempts rows with cross-question selected_choice_id = %',
    cross_question_attempt_choice_rows;

  IF cross_question_attempt_choice_rows <> 0 THEN
    RAISE EXCEPTION
      'DEBT-440 preflight failed: % attempts rows reference a choice from a different question',
      cross_question_attempt_choice_rows;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "attempts" DROP CONSTRAINT "attempts_selected_choice_id_choices_id_fk";
--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_params_json_object_chk" CHECK (jsonb_typeof("params_json") = 'object');
--> statement-breakpoint
CREATE INDEX "attempts_selected_choice_question_idx" ON "attempts" USING btree ("selected_choice_id","question_id");
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_selected_choice_question_fk" FOREIGN KEY ("selected_choice_id","question_id") REFERENCES "public"."choices"("id","question_id") ON DELETE restrict ON UPDATE no action;
