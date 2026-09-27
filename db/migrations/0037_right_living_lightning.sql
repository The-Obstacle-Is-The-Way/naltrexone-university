ALTER TYPE "public"."renewal_notice_kind" ADD VALUE 'anniversary_reminder';--> statement-breakpoint
ALTER TABLE "stripe_subscriptions" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stripe_subscriptions" ADD COLUMN "billing_cycle_anchor" timestamp with time zone;