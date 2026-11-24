-- DEBT-501 item 9: a watch for the daily Stripe reconcile.
--
-- One row per scheduled full reconcile run (dryRun=false&scope=all). The route
-- records its start once CRON_SECRET passes, and its finish, with the failed
-- rows' subscription IDs, when the reconciliation returns with a row that did
-- not fail. The renewal job reads the rows to report a run that never started
-- or never finished, and marks a run reported once its alert is sent. One row
-- a day, never pruned.
--
-- N-1: a new table; the previous release never reads or writes it.
-- Locks: none on existing tables; the index is built on the new, empty table.
CREATE TABLE "stripe_reconcile_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"failed_subscription_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"reported_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "stripe_reconcile_runs_started_at_idx" ON "stripe_reconcile_runs" USING btree ("started_at");