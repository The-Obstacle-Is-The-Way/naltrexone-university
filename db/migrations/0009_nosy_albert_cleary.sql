-- Finding 5: Prevent concurrent incomplete practice sessions per user.
-- If historical data contains multiple ended_at IS NULL sessions for the same user,
-- end all but the most recently started session so we can safely enforce the invariant.
WITH ranked_sessions AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY started_at DESC, id DESC
    ) AS session_rank
  FROM practice_sessions
  WHERE ended_at IS NULL
)
UPDATE practice_sessions
SET ended_at = now()
FROM ranked_sessions
WHERE practice_sessions.id = ranked_sessions.id
  AND ranked_sessions.session_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "practice_sessions_user_incomplete_uq"
  ON "practice_sessions" ("user_id")
  WHERE ended_at IS NULL;
