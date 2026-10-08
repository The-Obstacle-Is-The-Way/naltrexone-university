-- DEBT-505: the operational alert drill's once-per-cycle claims.
--
-- The renewal job raises a drill alert through the real alert path once per
-- fixed 30-day cycle. A cycle is claimed by inserting its row, so exactly one
-- run wins across cron runs and server instances; a drill that is not sent
-- deletes its row so a later run retries. Rows are never pruned: the rate
-- limiter keeps its counters for a day only, so a 30-day gate cannot live
-- there.
--
-- N-1: a new table; the previous release never reads or writes it.
-- Locks: none on existing tables.

CREATE TABLE "operational_alert_drills" (
	"cycle" integer PRIMARY KEY NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
