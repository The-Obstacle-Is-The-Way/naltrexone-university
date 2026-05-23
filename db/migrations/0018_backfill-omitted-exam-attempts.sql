-- Custom SQL migration file, put your code below! --
INSERT INTO "attempts" (
  "user_id",
  "question_id",
  "practice_session_id",
  "selected_choice_id",
  "is_omitted",
  "is_correct",
  "time_spent_seconds",
  "answered_at"
)
SELECT
  "practice_sessions"."user_id",
  (state.value ->> 'questionId')::uuid,
  "practice_sessions"."id",
  NULL,
  true,
  false,
  floor(
    least(
      greatest(
        coalesce((state.value ->> 'draftCumulativeMs')::numeric, 0),
        0
      ),
      86400000
    ) / 1000
  )::integer,
  "practice_sessions"."ended_at"
FROM "practice_sessions"
CROSS JOIN LATERAL jsonb_array_elements(
  coalesce("practice_sessions"."params_json" -> 'questionStates', '[]'::jsonb)
) AS state(value)
WHERE "practice_sessions"."mode" = 'exam'
  AND "practice_sessions"."ended_at" IS NOT NULL
  AND state.value ->> 'latestSelectedChoiceId' IS NULL
  AND state.value ->> 'latestIsCorrect' IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "attempts" existing_attempts
    WHERE existing_attempts."practice_session_id" = "practice_sessions"."id"
      AND existing_attempts."question_id" = (state.value ->> 'questionId')::uuid
  );
