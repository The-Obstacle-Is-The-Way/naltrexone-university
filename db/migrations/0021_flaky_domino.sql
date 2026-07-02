CREATE TABLE "practice_session_question_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"marked_for_review" boolean DEFAULT false NOT NULL,
	"latest_selected_choice_id" uuid,
	"latest_is_correct" boolean,
	"latest_answered_at" timestamp with time zone,
	"draft_selected_choice_id" uuid,
	"draft_saved_at" timestamp with time zone,
	"draft_cumulative_ms" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_session_question_states_draft_cumulative_ms_chk" CHECK ("practice_session_question_states"."draft_cumulative_ms" BETWEEN 0 AND 86400000),
	CONSTRAINT "practice_session_question_states_position_chk" CHECK ("practice_session_question_states"."position" >= 0),
	CONSTRAINT "practice_session_question_states_version_chk" CHECK ("practice_session_question_states"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ADD CONSTRAINT "practice_session_question_states_practice_session_id_practice_sessions_id_fk" FOREIGN KEY ("practice_session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ADD CONSTRAINT "practice_session_question_states_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ADD CONSTRAINT "practice_session_question_states_latest_selected_choice_id_choices_id_fk" FOREIGN KEY ("latest_selected_choice_id") REFERENCES "public"."choices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ADD CONSTRAINT "practice_session_question_states_draft_selected_choice_id_choices_id_fk" FOREIGN KEY ("draft_selected_choice_id") REFERENCES "public"."choices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "practice_session_question_states_session_question_uq" ON "practice_session_question_states" USING btree ("practice_session_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_session_question_states_session_position_uq" ON "practice_session_question_states" USING btree ("practice_session_id","position");--> statement-breakpoint
-- DEBT-425 backfill:start
INSERT INTO "practice_session_question_states" (
	"practice_session_id",
	"question_id",
	"position",
	"marked_for_review",
	"latest_selected_choice_id",
	"latest_is_correct",
	"latest_answered_at",
	"draft_selected_choice_id",
	"draft_saved_at",
	"draft_cumulative_ms"
)
SELECT
	"practice_sessions"."id",
	"question_entry"."question_id"::uuid,
	("question_entry"."position" - 1)::integer,
	CASE
		WHEN jsonb_typeof("matched_state"."state" -> 'markedForReview') = 'boolean'
			THEN ("matched_state"."state" ->> 'markedForReview')::boolean
		ELSE false
	END,
	CASE
		WHEN ("matched_state"."state" ->> 'latestSelectedChoiceId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
			THEN ("matched_state"."state" ->> 'latestSelectedChoiceId')::uuid
		ELSE NULL
	END,
	CASE
		WHEN jsonb_typeof("matched_state"."state" -> 'latestIsCorrect') = 'boolean'
			THEN ("matched_state"."state" ->> 'latestIsCorrect')::boolean
		ELSE NULL
	END,
	CASE
		WHEN jsonb_typeof("matched_state"."state" -> 'latestAnsweredAt') = 'string'
			THEN ("matched_state"."state" ->> 'latestAnsweredAt')::timestamp with time zone
		ELSE NULL
	END,
	CASE
		WHEN ("matched_state"."state" ->> 'draftSelectedChoiceId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
			THEN ("matched_state"."state" ->> 'draftSelectedChoiceId')::uuid
		ELSE NULL
	END,
	CASE
		WHEN jsonb_typeof("matched_state"."state" -> 'draftSavedAt') = 'string'
			THEN ("matched_state"."state" ->> 'draftSavedAt')::timestamp with time zone
		ELSE NULL
	END,
	CASE
		WHEN jsonb_typeof("matched_state"."state" -> 'draftCumulativeMs') = 'number'
			THEN LEAST(
				86400000::numeric,
				GREATEST(0::numeric, ("matched_state"."state" ->> 'draftCumulativeMs')::numeric)
			)::integer
		ELSE 0
	END
FROM "practice_sessions"
CROSS JOIN LATERAL jsonb_array_elements_text(
	CASE
		WHEN jsonb_typeof("practice_sessions"."params_json" -> 'questionIds') = 'array'
			THEN "practice_sessions"."params_json" -> 'questionIds'
		ELSE '[]'::jsonb
	END
) WITH ORDINALITY AS "question_entry"("question_id", "position")
LEFT JOIN LATERAL (
	SELECT "candidate_state"."state"
	FROM jsonb_array_elements(
		CASE
			WHEN jsonb_typeof("practice_sessions"."params_json" -> 'questionStates') = 'array'
				THEN "practice_sessions"."params_json" -> 'questionStates'
			ELSE '[]'::jsonb
		END
	) AS "candidate_state"("state")
	WHERE "candidate_state"."state" ->> 'questionId' = "question_entry"."question_id"
	LIMIT 1
) AS "matched_state" ON true
ON CONFLICT ("practice_session_id", "question_id") DO NOTHING;
-- DEBT-425 backfill:end
