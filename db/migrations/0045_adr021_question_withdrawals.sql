-- ADR-021 phase 4a (DEBT-483): withdrawals become a recorded overlay.
--
-- A withdrawal names a question and one of its revisions, with the reason,
-- the authority that ordered it and when it took effect. Withdrawal is per
-- question (#953), so every revision of a withdrawn question has a row. Later
-- phase 4 steps activate releases and roll back to earlier ones; selection
-- will exclude every withdrawn revision, whichever release names it.
--
-- Until now an archived question was the only record of a withdrawal, and
-- nothing distinguishes an operator's withdrawal from an archive in MDX. The
-- seed already refuses to bring either back, so the backfill records every
-- revision of each archived question as withdrawn. Synthetic placeholder
-- fixtures (slug placeholder-%) are excluded: the seed archives and restores
-- them by design, and this database records no source path, so the slug is
-- the only test it can apply here.
--
-- N-1: the serving deployment neither reads nor writes this table. The
-- previous commit's withdrawal command and seed archive without recording a
-- withdrawal, so withdraw from the deployed commit. An archive they make
-- during the deploy is recorded when it is replayed with this commit's
-- command or seed.
--
-- Locks: adding the foreign key takes SHARE ROW EXCLUSIVE on
-- question_revisions until commit, blocking only the operator-run seed. The
-- backfill reads questions and question_revisions, small content tables.
CREATE TABLE "question_withdrawals" (
	"question_id" uuid NOT NULL,
	"question_revision_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"authority" text NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_withdrawals_question_id_question_revision_id_pk" PRIMARY KEY("question_id","question_revision_id"),
	CONSTRAINT "question_withdrawals_reason_chk" CHECK ("question_withdrawals"."reason" ~ '[^[:space:]]'),
	CONSTRAINT "question_withdrawals_authority_chk" CHECK ("question_withdrawals"."authority" ~ '[^[:space:]]')
);
--> statement-breakpoint
ALTER TABLE "question_withdrawals" ADD CONSTRAINT "question_withdrawals_question_revision_fk" FOREIGN KEY ("question_revision_id","question_id") REFERENCES "public"."question_revisions"("id","question_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- DEBT-483 withdrawal backfill:start
DO $$
DECLARE
  recorded integer;
BEGIN
  INSERT INTO question_withdrawals (question_id, question_revision_id, reason, authority)
  SELECT r.question_id, r.id, 'archived before withdrawals were recorded', 'migration 0045'
  FROM question_revisions r
  JOIN questions q ON q.id = r.question_id
  WHERE q.status = 'archived' AND q.slug NOT LIKE 'placeholder-%'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS recorded = ROW_COUNT;
  RAISE NOTICE 'DEBT-483 withdrawal backfill: % revisions recorded', recorded;
END $$;
-- DEBT-483 withdrawal backfill:end
