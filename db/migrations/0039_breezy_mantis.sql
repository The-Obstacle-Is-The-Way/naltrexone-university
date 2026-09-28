CREATE TABLE "question_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"stem_md" text NOT NULL,
	"explanation_md" text NOT NULL,
	"reference_md" text,
	"difficulty" "question_difficulty" NOT NULL,
	"canonicalization_version" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_revisions_revision_number_chk" CHECK ("question_revisions"."revision_number" >= 1),
	CONSTRAINT "question_revisions_canonicalization_version_chk" CHECK ("question_revisions"."canonicalization_version" = 'stored-fields-json-v1'),
	CONSTRAINT "question_revisions_content_hash_chk" CHECK ("question_revisions"."content_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "question_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "choices" ADD COLUMN "question_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ADD COLUMN "question_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "current_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_revisions_id_question_id_uq" ON "question_revisions" USING btree ("id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_revisions_question_id_revision_number_uq" ON "question_revisions" USING btree ("question_id","revision_number");--> statement-breakpoint
-- Lock scope (ADR-021 phase 1): the two history tables grow with learner use,
-- so their revision keys are added NOT VALID. That takes no scan, while every
-- row written or updated from now on is still checked; the contract phase
-- validates them without blocking writes. The content tables (questions and
-- choices: 958 and 3,832 rows in the current corpus) are small, so their keys
-- are validated here.
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_question_revision_fk" FOREIGN KEY ("question_revision_id","question_id") REFERENCES "public"."question_revisions"("id","question_id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "choices" ADD CONSTRAINT "choices_question_revision_fk" FOREIGN KEY ("question_revision_id","question_id") REFERENCES "public"."question_revisions"("id","question_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_session_question_states" ADD CONSTRAINT "practice_session_question_states_question_revision_fk" FOREIGN KEY ("question_revision_id","question_id") REFERENCES "public"."question_revisions"("id","question_id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_current_revision_fk" FOREIGN KEY ("current_revision_id","id") REFERENCES "public"."question_revisions"("id","question_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "choices_question_revision_id_idx" ON "choices" USING btree ("question_revision_id");--> statement-breakpoint
-- stored-fields-json-v1 (ADR-021) of a question's legacy columns and its
-- choices. It must stay byte-identical to lib/content/question-revision-hash.ts;
-- the revision integration suite proves that over hard strings and the corpus.
-- PostgreSQL's to_json escapes text exactly as JSON.stringify does.
CREATE FUNCTION "question_content_json_v1"(p_question_id uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT '{"choices":[' || coalesce((
      SELECT string_agg(
        '{"explanation_md":' || coalesce(to_json(c.explanation_md)::text, 'null')
        || ',"is_correct":' || CASE WHEN c.is_correct THEN 'true' ELSE 'false' END
        || ',"label":' || to_json(c.label)::text
        || ',"sort_order":' || c.sort_order::text
        || ',"text_md":' || to_json(c.text_md)::text
        || '}',
        ',' ORDER BY c.sort_order)
      FROM "choices" c
      WHERE c.question_id = q.id), '')
    || '],"difficulty":' || to_json(q.difficulty::text)::text
    || ',"explanation_md":' || to_json(q.explanation_md)::text
    || ',"reference_md":' || coalesce(to_json(q.reference_md)::text, 'null')
    || ',"stem_md":' || to_json(q.stem_md)::text
    || '}'
  FROM "questions" q
  WHERE q.id = p_question_id
$$;--> statement-breakpoint
-- Phase 1 is the expand step of a parallel change (ADR-021): each question's
-- revision 1 mirrors its legacy row. This function makes that true for one
-- question: it creates the mirror, or refreshes it when the legacy content
-- changed, and attaches the question's choices. It returns 'created',
-- 'refreshed' or 'unchanged'. The seed calls it after every write, and the sweep
-- below repairs rows any other writer changed. Phase 2 makes revisions
-- append-only and immutable, and retires the refresh.
CREATE FUNCTION "sync_question_revision_v1"(p_question_id uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_content_json text;
  v_content_hash text;
  v_revision_id uuid;
  v_revision_hash text;
  v_outcome text;
BEGIN
  PERFORM 1 FROM "questions" WHERE id = p_question_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'question % does not exist', p_question_id
      USING ERRCODE = 'no_data_found';
  END IF;
  v_content_json := question_content_json_v1(p_question_id);
  v_content_hash := encode(sha256(convert_to(v_content_json, 'UTF8')), 'hex');

  SELECT r.id, r.content_hash INTO v_revision_id, v_revision_hash
  FROM "question_revisions" r
  WHERE r.question_id = p_question_id AND r.revision_number = 1;

  IF v_revision_id IS NULL THEN
    INSERT INTO "question_revisions" (
      question_id, revision_number, stem_md, explanation_md, reference_md,
      difficulty, canonicalization_version, content_hash
    )
    SELECT q.id, 1, q.stem_md, q.explanation_md, q.reference_md, q.difficulty,
      'stored-fields-json-v1', v_content_hash
    FROM "questions" q
    WHERE q.id = p_question_id
    RETURNING id INTO v_revision_id;
    v_outcome := 'created';
  ELSIF v_revision_hash <> v_content_hash THEN
    UPDATE "question_revisions" r
    SET stem_md = q.stem_md,
      explanation_md = q.explanation_md,
      reference_md = q.reference_md,
      difficulty = q.difficulty,
      content_hash = v_content_hash
    FROM "questions" q
    WHERE r.id = v_revision_id AND q.id = p_question_id;
    v_outcome := 'refreshed';
  ELSE
    v_outcome := 'unchanged';
  END IF;

  UPDATE "questions"
  SET current_revision_id = v_revision_id
  WHERE id = p_question_id
    AND current_revision_id IS DISTINCT FROM v_revision_id;
  UPDATE "choices"
  SET question_revision_id = v_revision_id
  WHERE question_id = p_question_id
    AND question_revision_id IS DISTINCT FROM v_revision_id;
  RETURN v_outcome;
END;
$$;--> statement-breakpoint
-- The re-runnable sweep over every question. The migration runs it once below;
-- later phases run it again before relying on complete coverage.
CREATE FUNCTION "sweep_question_revisions_v1"(
  OUT created integer,
  OUT refreshed integer,
  OUT unchanged integer
)
LANGUAGE plpgsql AS $$
DECLARE
  v_question_id uuid;
  v_outcome text;
BEGIN
  created := 0;
  refreshed := 0;
  unchanged := 0;
  FOR v_question_id IN SELECT id FROM "questions" ORDER BY id LOOP
    v_outcome := sync_question_revision_v1(v_question_id);
    IF v_outcome = 'created' THEN
      created := created + 1;
    ELSIF v_outcome = 'refreshed' THEN
      refreshed := refreshed + 1;
    ELSE
      unchanged := unchanged + 1;
    END IF;
  END LOOP;
END;
$$;--> statement-breakpoint
DO $$
DECLARE
  swept record;
BEGIN
  SELECT * INTO swept FROM sweep_question_revisions_v1();
  RAISE NOTICE 'ADR-021 revision sweep: % created, % refreshed, % unchanged',
    swept.created, swept.refreshed, swept.unchanged;
END;
$$;
