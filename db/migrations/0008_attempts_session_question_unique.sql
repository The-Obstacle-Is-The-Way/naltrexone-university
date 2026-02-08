-- BUG-105: Prevent duplicate attempts for the same question within a practice session.
-- Partial unique index — only enforced when practice_session_id IS NOT NULL,
-- so non-session attempts (practice_session_id = NULL) are not constrained.
WITH ranked_attempts AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY practice_session_id, question_id
      ORDER BY answered_at DESC, id DESC
    ) AS attempt_rank
  FROM attempts
  WHERE practice_session_id IS NOT NULL
)
DELETE FROM attempts
USING ranked_attempts
WHERE attempts.id = ranked_attempts.id
  AND ranked_attempts.attempt_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "attempts_session_question_uq"
  ON "attempts" ("practice_session_id", "question_id")
  WHERE practice_session_id IS NOT NULL;
