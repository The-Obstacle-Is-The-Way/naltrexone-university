-- ADR-021 phase 2a, first increment: new practice sessions bind each item to
-- its question's revision, and new attempts bind the revision they graded.
--
-- 1. Re-run the sweep first. A question an N-1 writer created or changed
--    since 0039 gets its revision 1 mirror before new code binds sessions and
--    attempts to questions.current_revision_id (#1177 review).
DO $$
DECLARE
  swept record;
BEGIN
  SELECT * INTO swept FROM sweep_question_revisions_v1();
  RAISE NOTICE 'ADR-021 phase 2a revision sweep: % created, % refreshed, % unchanged',
    swept.created, swept.refreshed, swept.unchanged;
END;
$$;--> statement-breakpoint
-- 2. The target of the (selected choice, revision) keys. choices.id is already
--    the primary key, so no existing row can collide. Lock scope: a standard
--    index build blocks writes to choices only; the corpus has 3,832 choices.
CREATE UNIQUE INDEX "choices_id_question_revision_id_uq" ON "choices" USING btree ("id","question_revision_id");--> statement-breakpoint
-- 3. A selected choice must belong to the bound revision (#1166 review). The
--    history tables grow with learner use, so the keys are added NOT VALID: no
--    scan, while every row written or updated from now on is checked. Every
--    existing row has a NULL revision, which MATCH SIMPLE accepts, and so do
--    the N-1 deployment's writes, which leave the revision NULL. The backfill
--    increment binds older rows and then validates these keys.
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_selected_choice_revision_fk" FOREIGN KEY ("selected_choice_id","question_revision_id") REFERENCES "public"."choices"("id","question_revision_id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ADD CONSTRAINT "practice_session_question_states_latest_choice_revision_fk" FOREIGN KEY ("latest_selected_choice_id","question_revision_id") REFERENCES "public"."choices"("id","question_revision_id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ADD CONSTRAINT "practice_session_question_states_draft_choice_revision_fk" FOREIGN KEY ("draft_selected_choice_id","question_revision_id") REFERENCES "public"."choices"("id","question_revision_id") ON DELETE restrict ON UPDATE no action NOT VALID;
