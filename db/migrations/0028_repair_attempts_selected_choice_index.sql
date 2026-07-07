-- Repair the 0027 drift window where the Neon dev branch applied an early
-- 0027_early_wallow.sql before attempts_selected_choice_question_idx was
-- added to that file. Production applied the final 0027 and already has this
-- index; local fresh databases also get it from 0027. This migration is
-- intentionally idempotent and heals the already-applied dev ledger without
-- mutating historical migration files again.
--
-- The attempts table is currently small; this standard CREATE INDEX lock is
-- acceptable under docs/dev/migration-authoring.md. Large live-table index
-- builds need a separately applied CREATE INDEX CONCURRENTLY path.
CREATE INDEX IF NOT EXISTS "attempts_selected_choice_question_idx"
  ON "attempts" USING btree ("selected_choice_id","question_id");
