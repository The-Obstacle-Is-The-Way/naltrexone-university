-- DEBT-494 (ADR-022 Amendment): whether the learner had a fair chance at a
-- session item, recorded when its session ends.
--
-- A score counts an item only if the learner could reach it: its question was
-- available when the session ended, or, in tutor mode, the learner had already
-- answered it. That fact cannot be rebuilt later, because a question's past
-- availability is not kept, so the statement that ends a session writes it
-- for every item. Null while a session is active.
--
-- Lock scope: ADD COLUMN takes ACCESS EXCLUSIVE on
-- practice_session_question_states, and Drizzle holds it until this
-- migration's transaction commits, so it blocks reads and writes of the table
-- while the backfill below runs. The nullable column has no default, so adding
-- it rewrites no row. The backfill updates each item of every ended session
-- once, and holds those row locks to the same commit. The table has one row
-- per session item; at this product's scale it is small, and it accepts that
-- cost, as 0026 does for practice_sessions. The deploy log's notice records
-- how many rows each deploy target updated.
ALTER TABLE "practice_session_question_states" ADD COLUMN "fair_chance_at_end" boolean;--> statement-breakpoint
-- A session that ended before this column is recorded once, here, from the
-- bank as it stands at this migration, the best evidence left. An item on a
-- question unpublished by then had no fair chance unless a tutor answer gave
-- it one. That keeps the scores those sessions already show, which leave out
-- unpublished questions, and a later retirement then changes none of them.
-- Only items not yet recorded are filled, so a rerun changes nothing.
-- DEBT-494 fair-chance backfill:start
DO $$
DECLARE
  recorded integer;
BEGIN
  UPDATE practice_session_question_states AS state
  SET fair_chance_at_end = question.status = 'published'
    OR (session.mode = 'tutor' AND state.latest_selected_choice_id IS NOT NULL)
  FROM practice_sessions AS session, questions AS question
  WHERE session.id = state.practice_session_id
    AND session.ended_at IS NOT NULL
    AND question.id = state.question_id
    AND state.fair_chance_at_end IS NULL;
  GET DIAGNOSTICS recorded = ROW_COUNT;
  RAISE NOTICE 'DEBT-494 fair-chance backfill: % items recorded', recorded;
END $$;
-- DEBT-494 fair-chance backfill:end
