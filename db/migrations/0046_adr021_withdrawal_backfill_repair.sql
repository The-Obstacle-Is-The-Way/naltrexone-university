-- ADR-021 phase 4a (DEBT-483): repair 0045's withdrawal backfill.
--
-- 0045 excluded every archived question whose slug starts with placeholder-.
-- The prefix alone does not make a question synthetic: the seed treats a file
-- as a synthetic fixture only when it also lives in content/questions/placeholder/,
-- and this database records no source path. An authored placeholder- question
-- archived before 0045 therefore got no withdrawal record. 0045 is already
-- applied on Preview, and an applied migration is never amended, so this
-- migration runs the backfill again with the corrected exclusion: only the ten
-- synthetic fixtures committed in content/questions/placeholder/, by exact
-- slug. Rows already recorded keep their first record.
--
-- N-1: the serving deployment neither reads nor writes question_withdrawals.
--
-- Locks: an insert into question_withdrawals and reads of questions and
-- question_revisions, small content tables; no DDL.
-- DEBT-483 withdrawal backfill repair:start
DO $$
DECLARE
  recorded integer;
BEGIN
  INSERT INTO question_withdrawals (question_id, question_revision_id, reason, authority)
  SELECT r.question_id, r.id, 'archived before withdrawals were recorded', 'migration 0046'
  FROM question_revisions r
  JOIN questions q ON q.id = r.question_id
  WHERE q.status = 'archived'
    AND q.slug NOT IN (
      'placeholder-01-naltrexone-mechanism',
      'placeholder-02-buprenorphine-induction-timing',
      'placeholder-03-alcohol-withdrawal-firstline',
      'placeholder-04-opioid-overdose-antidote',
      'placeholder-05-naltrexone-opioid-free-interval',
      'placeholder-06-tobacco-cessation-firstline',
      'placeholder-07-stimulant-intoxication-management',
      'placeholder-08-psychosocial-tx-motivational-interviewing',
      'placeholder-09-udt-interpretation',
      'placeholder-10-opioid-use-disorder-dsm5-criteria'
    )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS recorded = ROW_COUNT;
  RAISE NOTICE 'DEBT-483 withdrawal backfill repair: % revisions recorded', recorded;
END $$;
-- DEBT-483 withdrawal backfill repair:end
