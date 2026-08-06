CREATE TYPE "public"."renewal_consent_kind" AS ENUM('initial_offer', 'price_increase');--> statement-breakpoint
CREATE TYPE "public"."renewal_consent_source" AS ENUM('stripe_checkout', 'stripe_setup', 'application');--> statement-breakpoint
CREATE TYPE "public"."renewal_notice_delivery_status" AS ENUM('queued', 'processing', 'delivered', 'transient_failure', 'terminal_failure', 'outcome_unknown');--> statement-breakpoint
CREATE TYPE "public"."renewal_notice_kind" AS ENUM('acknowledgment', 'annual_reminder', 'renewal_notice', 'material_change', 'fee_change');--> statement-breakpoint
CREATE TABLE "renewal_consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"consumer_reference" varchar(64) NOT NULL,
	"stripe_customer_id" varchar(255) NOT NULL,
	"stripe_subscription_id" varchar(255) NOT NULL,
	"checkout_session_id" varchar(255),
	"setup_session_id" varchar(255),
	"plan" varchar(16) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"frequency" varchar(16) NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"cancellation_deadline" timestamp with time zone NOT NULL,
	"cancellation_method" text NOT NULL,
	"disclosure_snapshot" text NOT NULL,
	"disclosure_version" varchar(64) NOT NULL,
	"terms_version" varchar(64) NOT NULL,
	"terms_hash" varchar(128) NOT NULL,
	"consent_source" "renewal_consent_source" NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"consent_kind" "renewal_consent_kind" NOT NULL,
	"prior_amount_cents" integer,
	"proposed_amount_cents" integer,
	"effective_renewal_at" timestamp with time zone,
	"subscription_terminated_at" timestamp with time zone,
	"retain_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "renewal_consent_records_source_session_chk" CHECK (("renewal_consent_records"."consent_source" = 'stripe_checkout' AND "renewal_consent_records"."checkout_session_id" IS NOT NULL AND "renewal_consent_records"."setup_session_id" IS NULL)
          OR ("renewal_consent_records"."consent_source" = 'stripe_setup' AND "renewal_consent_records"."setup_session_id" IS NOT NULL AND "renewal_consent_records"."checkout_session_id" IS NULL)
          OR ("renewal_consent_records"."consent_source" = 'application' AND "renewal_consent_records"."checkout_session_id" IS NULL AND "renewal_consent_records"."setup_session_id" IS NULL)),
	CONSTRAINT "renewal_consent_records_amount_chk" CHECK ("renewal_consent_records"."amount_cents" > 0
          AND ("renewal_consent_records"."prior_amount_cents" IS NULL OR "renewal_consent_records"."prior_amount_cents" > 0)
          AND ("renewal_consent_records"."proposed_amount_cents" IS NULL OR "renewal_consent_records"."proposed_amount_cents" > 0)),
	CONSTRAINT "renewal_consent_records_kind_terms_chk" CHECK (("renewal_consent_records"."consent_kind" = 'initial_offer' AND "renewal_consent_records"."prior_amount_cents" IS NULL AND "renewal_consent_records"."proposed_amount_cents" IS NULL AND "renewal_consent_records"."effective_renewal_at" IS NULL)
          OR ("renewal_consent_records"."consent_kind" = 'price_increase' AND "renewal_consent_records"."prior_amount_cents" IS NOT NULL AND "renewal_consent_records"."proposed_amount_cents" IS NOT NULL AND "renewal_consent_records"."effective_renewal_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "renewal_notice_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_kind" "renewal_notice_kind" NOT NULL,
	"consent_record_id" uuid,
	"stripe_subscription_id" varchar(255),
	"applicable_at" timestamp with time zone,
	"disclosure_version" varchar(64) NOT NULL,
	"destination" varchar(320) NOT NULL,
	"provider_idempotency_key" varchar(255) NOT NULL,
	"payload_snapshot" text NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"status" "renewal_notice_delivery_status" DEFAULT 'queued' NOT NULL,
	"provider_event_id" varchar(255),
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"attempt_id" varchar(255),
	"attempt_started_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"failure_class" varchar(64),
	"failure_code" varchar(128),
	"requeue_reason" text,
	"requeued_at" timestamp with time zone,
	"requeued_by" varchar(255),
	"requeue_audit" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "renewal_notice_deliveries_key_shape_chk" CHECK (("renewal_notice_deliveries"."notice_kind" = 'acknowledgment' AND "renewal_notice_deliveries"."consent_record_id" IS NOT NULL AND "renewal_notice_deliveries"."stripe_subscription_id" IS NULL AND "renewal_notice_deliveries"."applicable_at" IS NULL)
          OR ("renewal_notice_deliveries"."notice_kind" IN ('annual_reminder', 'renewal_notice', 'material_change', 'fee_change') AND "renewal_notice_deliveries"."consent_record_id" IS NULL AND "renewal_notice_deliveries"."stripe_subscription_id" IS NOT NULL AND "renewal_notice_deliveries"."applicable_at" IS NOT NULL)),
	CONSTRAINT "renewal_notice_deliveries_attempt_count_chk" CHECK ("renewal_notice_deliveries"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "trial_payment_method_setup_operations" ADD COLUMN "cancellation_method" text NOT NULL;--> statement-breakpoint
ALTER TABLE "renewal_consent_records" ADD CONSTRAINT "renewal_consent_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_notice_deliveries" ADD CONSTRAINT "renewal_notice_deliveries_consent_record_id_renewal_consent_records_id_fk" FOREIGN KEY ("consent_record_id") REFERENCES "public"."renewal_consent_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "renewal_consent_records_checkout_session_uq" ON "renewal_consent_records" USING btree ("checkout_session_id") WHERE "renewal_consent_records"."checkout_session_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "renewal_consent_records_setup_session_uq" ON "renewal_consent_records" USING btree ("setup_session_id") WHERE "renewal_consent_records"."setup_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "renewal_consent_records_consumer_reference_idx" ON "renewal_consent_records" USING btree ("consumer_reference");--> statement-breakpoint
CREATE INDEX "renewal_consent_records_subscription_accepted_at_idx" ON "renewal_consent_records" USING btree ("stripe_subscription_id","accepted_at");--> statement-breakpoint
CREATE INDEX "renewal_consent_records_retention_idx" ON "renewal_consent_records" USING btree ("subscription_terminated_at","retain_until");--> statement-breakpoint
CREATE UNIQUE INDEX "renewal_notice_deliveries_provider_idempotency_key_uq" ON "renewal_notice_deliveries" USING btree ("provider_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "renewal_notice_deliveries_acknowledgment_uq" ON "renewal_notice_deliveries" USING btree ("notice_kind","consent_record_id","destination") WHERE "renewal_notice_deliveries"."notice_kind" = 'acknowledgment';--> statement-breakpoint
CREATE UNIQUE INDEX "renewal_notice_deliveries_scheduled_uq" ON "renewal_notice_deliveries" USING btree ("notice_kind","stripe_subscription_id","applicable_at","disclosure_version","destination") WHERE "renewal_notice_deliveries"."notice_kind" IN ('annual_reminder', 'renewal_notice', 'material_change', 'fee_change');--> statement-breakpoint
CREATE INDEX "renewal_notice_deliveries_status_next_attempt_idx" ON "renewal_notice_deliveries" USING btree ("status","next_attempt_at");