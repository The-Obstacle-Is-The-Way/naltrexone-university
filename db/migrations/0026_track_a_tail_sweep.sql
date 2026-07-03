ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "error_details" jsonb;--> statement-breakpoint
-- DEBT-428/434 cleanup:start
-- DEBT-430: this is a one-shot bounded cleanup over the currently small
-- practice_sessions table; keep future data-cleanup migrations explicit about
-- affected-row counts and lock scope.
DO $$
DECLARE
  normalized_params_json_rows integer := 0;
  stripped_question_states_rows integer := 0;
  invalid_string_rows integer := 0;
BEGIN
  WITH string_params AS (
    SELECT
      "id",
      ("params_json" #>> '{}')::jsonb AS parsed_params_json
    FROM "practice_sessions"
    WHERE jsonb_typeof("params_json") = 'string'
  )
  SELECT count(*)::integer
  INTO invalid_string_rows
  FROM string_params
  WHERE jsonb_typeof(parsed_params_json) <> 'object';

  IF invalid_string_rows > 0 THEN
    RAISE EXCEPTION
      'DEBT-428 cleanup found % string params_json rows that do not parse to JSON objects',
      invalid_string_rows;
  END IF;

  WITH string_params AS (
    SELECT
      "id",
      ("params_json" #>> '{}')::jsonb AS parsed_params_json
    FROM "practice_sessions"
    WHERE jsonb_typeof("params_json") = 'string'
  )
  UPDATE "practice_sessions"
  SET "params_json" = string_params.parsed_params_json
  FROM string_params
  WHERE "practice_sessions"."id" = string_params."id";
  GET DIAGNOSTICS normalized_params_json_rows = ROW_COUNT;

  UPDATE "practice_sessions"
  SET "params_json" = "params_json" - 'questionStates'
  WHERE jsonb_typeof("params_json") = 'object'
    AND "params_json" ? 'questionStates';
  GET DIAGNOSTICS stripped_question_states_rows = ROW_COUNT;

  RAISE NOTICE
    'DEBT-428 normalized string params_json rows: %',
    normalized_params_json_rows;
  RAISE NOTICE
    'DEBT-434 stripped params_json.questionStates rows: %',
    stripped_question_states_rows;
END $$;
-- DEBT-428/434 cleanup:end
