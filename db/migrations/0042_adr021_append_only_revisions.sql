-- ADR-021 phase 2b: content writers become append-only.
--
-- From here a question may have more than one revision. Changed content is a
-- new revision with its own choice rows, and a revision and its choices are
-- never updated. History keeps the revision it was shown and graded against.
--
-- 1. Bind any history row still unbound, while every question still has one
--    revision, then fail loudly if any row or choice names no revision.
--    Production had none after 0041 (306 session states and 249 attempts
--    bound, 0 remaining). A row locked by a concurrent writer is skipped and
--    counted as remaining, so the migration fails and the deploy is retried.
-- 2. A choice's label and sort order become unique within its revision
--    instead of its question, so a newer revision may reuse them.
-- 3. The functions that refreshed revision 1 in place are retired. After a
--    second revision exists, sync_question_revision_v1 would point the
--    question back at revision 1 and re-attach the newer revision's choices
--    to it, and bind_history_revisions_v1 would bind an unanswered row to a
--    revision newer than the one it showed.
-- 4. Triggers reject every update to a revision or a choice. Deletes still
--    cascade from the question.
--
-- N-1: the serving deployment never writes revisions or choices (only the
-- operator-run seed does), never relies on the per-question keys, and names
-- the revision of every attempt and session state it writes. The seed of the
-- previous commit calls the retired sync function and fails loudly, so seed
-- from the deployed commit; the new seed refuses to run before this
-- migration has committed.
--
-- Locks: history updates touch only unbound rows (none in production). The
-- choices and question_revisions tables are small content tables. DROP INDEX
-- takes ACCESS EXCLUSIVE on choices until commit, so it runs last.
DO $$
DECLARE
  bound record;
BEGIN
  SELECT * INTO bound FROM bind_history_revisions_v1(2147483647);
  RAISE NOTICE 'ADR-021 phase 2b: % session states and % attempts bound; % and % remain unbound',
    bound.states_bound, bound.attempts_bound,
    bound.states_remaining, bound.attempts_remaining;
END $$;--> statement-breakpoint
CREATE FUNCTION "assert_question_revisions_bound_v1"() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  unbound_states integer;
  unbound_attempts integer;
  unbound_choices integer;
  unpointed_questions integer;
BEGIN
  SELECT count(*)::int INTO unbound_states
  FROM practice_session_question_states WHERE question_revision_id IS NULL;
  SELECT count(*)::int INTO unbound_attempts
  FROM attempts WHERE question_revision_id IS NULL;
  SELECT count(*)::int INTO unbound_choices
  FROM choices WHERE question_revision_id IS NULL;
  SELECT count(*)::int INTO unpointed_questions
  FROM questions WHERE current_revision_id IS NULL;
  IF unbound_states + unbound_attempts + unbound_choices + unpointed_questions > 0 THEN
    RAISE EXCEPTION 'ADR-021: % session states, % attempts, % choices and % questions name no revision',
      unbound_states, unbound_attempts, unbound_choices, unpointed_questions
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
END $$;--> statement-breakpoint
SELECT "assert_question_revisions_bound_v1"();--> statement-breakpoint
CREATE UNIQUE INDEX "choices_question_revision_id_label_uq" ON "choices" USING btree ("question_revision_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "choices_question_revision_id_sort_order_uq" ON "choices" USING btree ("question_revision_id","sort_order");--> statement-breakpoint
DROP FUNCTION "sweep_question_revisions_v1"();--> statement-breakpoint
DROP FUNCTION "sync_question_revision_v1"(uuid);--> statement-breakpoint
DROP FUNCTION "question_content_json_v1"(uuid);--> statement-breakpoint
DROP FUNCTION "bind_history_revisions_v1"(integer);--> statement-breakpoint
CREATE FUNCTION "reject_question_content_update_v1"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ADR-021: % row % is immutable; changed content is a new revision',
    TG_TABLE_NAME, OLD.id
    USING ERRCODE = 'restrict_violation';
END $$;--> statement-breakpoint
CREATE TRIGGER "question_revisions_reject_update" BEFORE UPDATE ON "question_revisions"
  FOR EACH ROW EXECUTE FUNCTION "reject_question_content_update_v1"();--> statement-breakpoint
CREATE TRIGGER "choices_reject_update" BEFORE UPDATE ON "choices"
  FOR EACH ROW EXECUTE FUNCTION "reject_question_content_update_v1"();--> statement-breakpoint
DROP INDEX "choices_question_id_label_uq";--> statement-breakpoint
DROP INDEX "choices_question_id_sort_order_uq";
