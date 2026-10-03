-- DEBT-490: an activation records why it was made, and on whose authority.
--
-- The withdrawal and hold commands require a reason and an authority. An
-- activation, a rollback and the bootstrap recorded neither, so after a
-- release removed or withdrew clinical content, the database could not say
-- who decided it or why. Each receipt in content_release_activations now
-- carries both, non-blank, like question_withdrawals. A receipt is a decision
-- record, so it becomes immutable, as releases, items and withdrawals already
-- are (0047's reject_immutable_row_update_v1).
--
-- Existing receipts: per the records, no Preview or production database has
-- been bootstrapped, so none has an activation; local databases do. Rather
-- than depend on that, any existing receipt gets an explicit marker instead
-- of a guessed decision, and the notice below counts them in the deploy log.
-- The defaults exist only to fill those rows and are dropped at once, so
-- every new receipt must name its own reason and authority.
--
-- N-1: the serving deployment reads and writes none of this table. Only the
-- operator release scripts insert receipts; an older script that names no
-- decision now fails on NOT NULL instead of writing an unattributed receipt.
--
-- Locks: ACCESS EXCLUSIVE on content_release_activations, empty in every
-- deployed database per the records, until commit.
ALTER TABLE "content_release_activations" ADD COLUMN "reason" text NOT NULL DEFAULT 'not recorded: activated before DEBT-490';--> statement-breakpoint
ALTER TABLE "content_release_activations" ADD COLUMN "authority" text NOT NULL DEFAULT 'not recorded';--> statement-breakpoint
DO $$
DECLARE
  marked integer;
BEGIN
  SELECT count(*) INTO marked FROM "content_release_activations";
  RAISE NOTICE 'DEBT-490 activation decision record: % existing receipts marked not recorded', marked;
END $$;--> statement-breakpoint
ALTER TABLE "content_release_activations" ALTER COLUMN "reason" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "content_release_activations" ALTER COLUMN "authority" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "content_release_activations" ADD CONSTRAINT "content_release_activations_reason_chk" CHECK ("content_release_activations"."reason" ~ '[^[:space:]]');--> statement-breakpoint
ALTER TABLE "content_release_activations" ADD CONSTRAINT "content_release_activations_authority_chk" CHECK ("content_release_activations"."authority" ~ '[^[:space:]]');--> statement-breakpoint
CREATE TRIGGER "content_release_activations_reject_update" BEFORE UPDATE ON "content_release_activations"
  FOR EACH ROW EXECUTE FUNCTION "reject_immutable_row_update_v1"();
