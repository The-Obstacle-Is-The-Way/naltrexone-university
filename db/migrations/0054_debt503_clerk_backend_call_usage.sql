-- DEBT-503 item 4, step 1: the daily roll-up of the Clerk limiter's counters.
--
-- The renewal and reconcile jobs roll the per-minute counters rate_limits keeps
-- for a day into one row per bucket (address, session, site, the two signed-in
-- buckets, and the call-failed and token-rejected alert counters), with no
-- address or session in it. Each bucket's period starts where its previous row
-- ended, at most a day back. Runs hold an advisory lock, so their periods never
-- overlap, and the primary key on (bucket, period_start) refuses a period
-- written twice. Rows are never pruned: seven a run, two runs a day.
--
-- N-1: a new table; the previous release never reads or writes it.
-- Locks: none on existing tables.

CREATE TABLE "clerk_backend_call_usage" (
	"bucket" varchar(128) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"per_minute_limit" integer NOT NULL,
	"counted" bigint NOT NULL,
	"busiest_minute" integer NOT NULL,
	"windows_over_limit" bigint NOT NULL,
	"counted_over_limit" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clerk_backend_call_usage_bucket_period_start_pk" PRIMARY KEY("bucket","period_start"),
	CONSTRAINT "clerk_backend_call_usage_period_chk" CHECK ("clerk_backend_call_usage"."period_start" < "clerk_backend_call_usage"."period_end")
);
