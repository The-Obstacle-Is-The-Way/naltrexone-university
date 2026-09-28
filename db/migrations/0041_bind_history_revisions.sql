-- ADR-021 phase 2a, second increment: bind older history to its revision.
--
-- Since 0040, every new session state and attempt binds the revision the
-- learner was shown and graded against. The serving deployment writes no
-- unbound row, so the rows written before that are a fixed set, and this
-- bounded, batched function binds them. The rule is the one new rows follow:
-- a session state binds its question's current revision, and an attempt binds
-- its session state's revision, else its question's current one.
--
-- A row is bound only if its selections are choices of that revision, so the
-- (selected choice, revision) keys can never reject the update. Any other row
-- stays unbound and is counted as remaining; phase 2b's migration refuses to
-- run while any row remains unbound.
CREATE FUNCTION "bind_history_revisions_v1"(
  p_limit integer,
  OUT states_bound integer,
  OUT attempts_bound integer,
  OUT states_remaining integer,
  OUT attempts_remaining integer
)
LANGUAGE plpgsql AS $$
BEGIN
  WITH batch AS (
    SELECT s.id, q.current_revision_id AS revision_id
    FROM practice_session_question_states s
    JOIN questions q ON q.id = s.question_id
    WHERE s.question_revision_id IS NULL
      AND q.current_revision_id IS NOT NULL
      AND (s.latest_selected_choice_id IS NULL OR EXISTS (
        SELECT 1 FROM choices c
        WHERE c.id = s.latest_selected_choice_id
          AND c.question_revision_id = q.current_revision_id))
      AND (s.draft_selected_choice_id IS NULL OR EXISTS (
        SELECT 1 FROM choices c
        WHERE c.id = s.draft_selected_choice_id
          AND c.question_revision_id = q.current_revision_id))
    ORDER BY s.id
    LIMIT p_limit
    FOR UPDATE OF s SKIP LOCKED
  )
  UPDATE practice_session_question_states s
  SET question_revision_id = batch.revision_id
  FROM batch
  WHERE s.id = batch.id;
  GET DIAGNOSTICS states_bound = ROW_COUNT;

  WITH candidates AS (
    SELECT a.id, a.selected_choice_id,
      COALESCE(s.question_revision_id, q.current_revision_id) AS revision_id
    FROM attempts a
    JOIN questions q ON q.id = a.question_id
    LEFT JOIN practice_session_question_states s
      ON s.practice_session_id = a.practice_session_id
     AND s.question_id = a.question_id
    WHERE a.question_revision_id IS NULL
  ),
  batch AS (
    SELECT candidates.id, candidates.revision_id
    FROM candidates
    WHERE candidates.revision_id IS NOT NULL
      AND (candidates.selected_choice_id IS NULL OR EXISTS (
        SELECT 1 FROM choices c
        WHERE c.id = candidates.selected_choice_id
          AND c.question_revision_id = candidates.revision_id))
    ORDER BY candidates.id
    LIMIT p_limit
  )
  UPDATE attempts a
  SET question_revision_id = batch.revision_id
  FROM batch
  WHERE a.id = batch.id
    AND a.question_revision_id IS NULL;
  GET DIAGNOSTICS attempts_bound = ROW_COUNT;

  SELECT count(*) INTO states_remaining
  FROM practice_session_question_states
  WHERE question_revision_id IS NULL;
  SELECT count(*) INTO attempts_remaining
  FROM attempts
  WHERE question_revision_id IS NULL;
END;
$$;--> statement-breakpoint
-- Lock scope: one bounded batch of at most 50,000 rows per table, each row
-- locked only for this migration's transaction. The deploy log records the
-- counts, so production's real sizes are measured here; any remainder is
-- bound by a later run before phase 2b.
DO $$
DECLARE
  bound record;
BEGIN
  SELECT * INTO bound FROM bind_history_revisions_v1(50000);
  RAISE NOTICE 'ADR-021 phase 2a history binding: % session states and % attempts bound; % and % remain unbound',
    bound.states_bound, bound.attempts_bound,
    bound.states_remaining, bound.attempts_remaining;
END;
$$;--> statement-breakpoint
-- Validate the history keys added NOT VALID by 0039 and 0040. VALIDATE takes a
-- SHARE UPDATE EXCLUSIVE lock, which blocks neither reads nor writes; unbound
-- rows have a NULL revision, which these MATCH SIMPLE keys accept.
ALTER TABLE "attempts" VALIDATE CONSTRAINT "attempts_question_revision_fk";--> statement-breakpoint
ALTER TABLE "practice_session_question_states" VALIDATE CONSTRAINT "practice_session_question_states_question_revision_fk";--> statement-breakpoint
ALTER TABLE "attempts" VALIDATE CONSTRAINT "attempts_selected_choice_revision_fk";--> statement-breakpoint
ALTER TABLE "practice_session_question_states" VALIDATE CONSTRAINT "practice_session_question_states_latest_choice_revision_fk";--> statement-breakpoint
ALTER TABLE "practice_session_question_states" VALIDATE CONSTRAINT "practice_session_question_states_draft_choice_revision_fk";
