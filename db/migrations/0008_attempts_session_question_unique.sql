-- BUG-105: Prevent duplicate attempts for the same question within a practice session.
-- Partial unique index — only enforced when practice_session_id IS NOT NULL,
-- so non-session attempts (practice_session_id = NULL) are not constrained.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "attempts_session_question_uq"
  ON "attempts" ("practice_session_id", "question_id")
  WHERE practice_session_id IS NOT NULL;
